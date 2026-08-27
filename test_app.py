import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import httpx
from openai import APITimeoutError

import app as app_module


class FakeCompletions:
    def __init__(self):
        self.responses = []
        self.calls = []

    def queue(self, payload):
        self.responses.append(json.dumps(payload, ensure_ascii=False))

    def queue_content(self, content):
        self.responses.append(content)

    def queue_error(self, error):
        self.responses.append(error)

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self.responses:
            raise AssertionError("fake model response queue is empty")
        next_response = self.responses.pop(0)
        if isinstance(next_response, BaseException):
            raise next_response
        message = SimpleNamespace(content=next_response)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])


class LearningLoopTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_database = app_module.DATABASE
        self.original_client = app_module.client
        self.original_retry_delays = app_module.MODEL_RETRY_DELAYS
        app_module.DATABASE = Path(self.temp_dir.name) / "test.db"
        app_module.MODEL_RETRY_DELAYS = (0, 0)
        self.completions = FakeCompletions()
        app_module.client = SimpleNamespace(
            chat=SimpleNamespace(completions=self.completions)
        )
        app_module.init_db()
        app_module.app.config.update(TESTING=True)
        self.client = app_module.app.test_client()
        self.session_id = "student_test_01"

    def tearDown(self):
        app_module.DATABASE = self.original_database
        app_module.client = self.original_client
        app_module.MODEL_RETRY_DELAYS = self.original_retry_delays
        self.temp_dir.cleanup()

    def chat(self, weak_point=None, mode="guide"):
        self.completions.queue({
            "reply": "我们继续看这个知识点。",
            "recordable": True,
            "takeaway": "移项时等式两边要保持相等",
            "concept": "一元一次方程",
            "weak_point": weak_point,
        })
        return self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": mode,
            "message": "我不太会移项",
        })

    def generate_and_answer(self, correct, weak_point=None):
        with app_module.get_db() as db:
            point_id = db.execute("SELECT id FROM knowledge_points").fetchone()[0]
        self.completions.queue({"question": "方程 x + 3 = 7 中，x 等于多少？"})
        generated = self.client.post("/practice", json={
            "session_id": self.session_id,
            "knowledge_point_id": point_id,
        })
        self.assertEqual(generated.status_code, 200)
        attempt_id = generated.get_json()["attempt"]["id"]
        self.completions.queue({
            "correct": correct,
            "feedback": "判断完成。",
            "weak_point": weak_point,
        })
        return self.client.post("/practice", json={
            "session_id": self.session_id,
            "attempt_id": attempt_id,
            "answer": "x = 4",
        })

    def test_chat_retries_a_transient_provider_timeout(self):
        self.completions.queue_error(APITimeoutError(request=httpx.Request("POST", "https://api.deepseek.com/v1/chat/completions")))
        self.completions.queue({
            "reply": "连接恢复了，我们继续。",
            "recordable": False,
            "takeaway": None,
            "concept": None,
            "weak_point": None,
        })

        response = self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": "guide",
            "message": "继续刚才的问题",
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["reply"], "连接恢复了，我们继续。")
        self.assertEqual(len(self.completions.calls), 2)
        response.close()

    def test_chat_stops_after_bounded_transient_retries(self):
        for _ in range(3):
            self.completions.queue_error(APITimeoutError(request=httpx.Request("POST", "https://api.deepseek.com/v1/chat/completions")))

        response = self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": "guide",
            "message": "继续刚才的问题",
        })

        self.assertEqual(response.status_code, 503)
        self.assertEqual(len(self.completions.calls), 3)
        response.close()

    def test_chat_disables_json_mode_after_an_empty_response(self):
        self.completions.queue_content("")
        self.completions.queue({
            "reply": "已经从空响应中恢复。",
            "recordable": False,
            "takeaway": None,
            "concept": None,
            "weak_point": None,
        })

        response = self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": "guide",
            "message": "继续刚才的问题",
        })

        self.assertEqual(response.status_code, 200)
        self.assertIn("response_format", self.completions.calls[0])
        self.assertNotIn("response_format", self.completions.calls[1])
        response.close()

    def test_same_concept_is_aggregated_and_diagnosis_records_evidence(self):
        self.assertEqual(self.chat("普通模式不应保存这个字段").status_code, 200)
        with app_module.get_db() as db:
            self.assertIsNone(db.execute("SELECT weak_point FROM knowledge_points").fetchone()[0])
        response = self.chat("把移项误解为直接改符号", mode="diagnose")
        self.assertEqual(response.status_code, 200)

        payload = self.client.get(
            f"/history?session_id={self.session_id}"
        ).get_json()
        self.assertEqual(len(payload["points"]), 1)
        self.assertEqual(payload["points"][0]["mastery_level"], "practicing")
        self.assertEqual(payload["points"][0]["weak_point"], "把移项误解为直接改符号")
        with app_module.get_db() as db:
            event_count = db.execute("SELECT COUNT(*) FROM learning_records").fetchone()[0]
        self.assertEqual(event_count, 2)

    def test_mastery_requires_two_consecutive_correct_answers(self):
        self.assertEqual(self.chat().status_code, 200)
        first = self.generate_and_answer(True).get_json()["point"]
        first_generation = json.loads(self.completions.calls[-2]["messages"][1]["content"])
        self.assertEqual(first_generation["difficulty"], "standard")
        self.assertEqual(first["mastery_level"], "practicing")
        self.assertEqual(first["correct_streak"], 1)
        self.assertEqual(first["incorrect_streak"], 0)
        self.assertEqual(first["support_level"], "guided")

        second = self.generate_and_answer(True).get_json()["point"]
        second_generation = json.loads(self.completions.calls[-2]["messages"][1]["content"])
        self.assertEqual(second_generation["difficulty"], "consolidation")
        self.assertEqual(second["mastery_level"], "mastered")
        self.assertEqual(second["correct_streak"], 2)
        self.assertEqual(second["support_level"], "challenge")

        third = self.generate_and_answer(False, "等式两边没有做相同运算").get_json()["point"]
        third_generation = json.loads(self.completions.calls[-2]["messages"][1]["content"])
        self.assertEqual(third_generation["difficulty"], "transfer")
        self.assertEqual(third["mastery_level"], "practicing")
        self.assertEqual(third["correct_streak"], 0)
        self.assertEqual(third["incorrect_streak"], 1)
        self.assertEqual(third["weak_point"], "等式两边没有做相同运算")
        self.assertEqual(third["support_level"], "high")

        fourth = self.generate_and_answer(False, "仍未保持等式两边相等").get_json()["point"]
        fourth_generation = json.loads(self.completions.calls[-2]["messages"][1]["content"])
        self.assertEqual(fourth_generation["difficulty"], "foundation")
        self.assertEqual(fourth["incorrect_streak"], 2)
        self.assertEqual(fourth["support_level"], "high")

    def test_review_page_renders_required_controls(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        page = response.get_data(as_text=True)
        for element_id in (
            "reviewView",
            "reviewList",
            "practiceDialog",
            "practiceAnswer",
            "practiceSubmit",
            "profileDialog",
            "profileForm",
            "memoryErrorList",
            "memoryDialog",
            "memoryConcept",
            "memoryAttemptList",
        ):
            self.assertIn(f'id="{element_id}"', page)

    def test_math_rendering_assets_are_local_and_messages_use_them(self):
        page = self.client.get("/").get_data(as_text=True)
        self.assertIn("/static/vendor/katex/katex.min.css", page)
        self.assertIn("/static/vendor/katex/katex.min.js", page)
        self.assertIn("/static/vendor/katex/contrib/auto-render.min.js", page)
        self.assertNotIn("cdn.jsdelivr.net/npm/katex", page)

        script_response = self.client.get("/static/js/script.js")
        script = script_response.get_data(as_text=True)
        script_response.close()
        self.assertIn("function renderMath(container)", script)
        self.assertIn("renderMath(bubble)", script)
        self.assertIn('{ left: "\\\\(", right: "\\\\)", display: false }', script)

        for asset in ("katex.min.js", "contrib/auto-render.min.js"):
            asset_response = self.client.get(f"/static/vendor/katex/{asset}")
            self.assertEqual(asset_response.status_code, 200)
            asset_response.close()

    def test_non_learning_turn_does_not_pollute_review(self):
        self.completions.queue({
            "reply": "你好，今天想从哪里开始？",
            "recordable": False,
            "takeaway": None,
            "concept": None,
            "weak_point": None,
        })
        response = self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": "guide",
            "message": "你好",
        })
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.get_json()["point"])
        with app_module.get_db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM knowledge_points").fetchone()[0], 0)

    def test_legacy_learning_records_are_preserved_and_linked(self):
        legacy_database = Path(self.temp_dir.name) / "legacy.db"
        with sqlite3.connect(legacy_database) as db:
            db.execute(
                """CREATE TABLE learning_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )"""
            )
            db.execute(
                "INSERT INTO learning_records(session_id, summary, created_at) VALUES (?, ?, ?)",
                (self.session_id, "分数相加前要先通分", "2026-08-26T09:00:00+08:00"),
            )
        app_module.DATABASE = legacy_database
        app_module.init_db()
        with app_module.get_db() as db:
            record = db.execute(
                "SELECT summary, knowledge_point_id FROM learning_records"
            ).fetchone()
            point_count = db.execute("SELECT COUNT(*) FROM knowledge_points").fetchone()[0]
        self.assertEqual(record["summary"], "分数相加前要先通分")
        self.assertIsNotNone(record["knowledge_point_id"])
        self.assertEqual(point_count, 1)

    def test_profile_and_structured_memory_are_injected_into_chat(self):
        saved = self.client.put("/profile", json={
            "session_id": self.session_id,
            "grade_level": "初中",
            "primary_subject": "数学",
            "preferred_style": "step_by_step",
        })
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.get_json()["profile"]["primary_subject"], "数学")

        self.assertEqual(self.chat().status_code, 200)
        first_system_prompt = self.completions.calls[-1]["messages"][0]["content"]
        self.assertIn('"grade_level": "初中"', first_system_prompt)
        self.assertIn('"preferred_style": "step_by_step"', first_system_prompt)

        self.completions.queue({
            "reply": "先回忆移项时等式两边发生了什么。",
            "recordable": False,
            "takeaway": None,
            "concept": None,
            "weak_point": None,
        })
        response = self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": "guide",
            "message": "再帮我看看刚才的知识点",
        })
        self.assertEqual(response.status_code, 200)
        remembered_prompt = self.completions.calls[-1]["messages"][0]["content"]
        self.assertIn("一元一次方程", remembered_prompt)
        self.assertIn('"support_level": "standard"', remembered_prompt)

        loaded = self.client.get(f"/profile?session_id={self.session_id}")
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.get_json()["profile"]["grade_level"], "初中")

    def test_clearing_learning_memory_preserves_chat_but_removes_profile_and_points(self):
        self.client.put("/profile", json={
            "session_id": self.session_id,
            "grade_level": "高中",
            "primary_subject": "物理",
            "preferred_style": "examples",
        })
        self.assertEqual(self.chat().status_code, 200)
        cleared = self.client.delete("/profile", json={
            "session_id": self.session_id,
            "clear_learning_memory": True,
        })
        self.assertEqual(cleared.status_code, 200)
        self.assertTrue(cleared.get_json()["learning_memory_cleared"])
        with app_module.get_db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM student_profiles").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM knowledge_points").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 2)

    def test_long_term_memory_is_bounded_to_relevant_structured_points(self):
        now = "2026-08-26T10:00:00+08:00"
        with app_module.get_db() as db:
            for index in range(7):
                db.execute(
                    """INSERT INTO knowledge_points(
                           session_id, concept_key, concept, summary, mastery_level,
                           first_seen_at, last_seen_at
                       ) VALUES (?, ?, ?, ?, 'practicing', ?, ?)""",
                    (self.session_id, f"active{index}", f"待巩固{index}", f"摘要{index}", now, now),
                )
            for index in range(4):
                db.execute(
                    """INSERT INTO knowledge_points(
                           session_id, concept_key, concept, summary, mastery_level,
                           first_seen_at, last_seen_at
                       ) VALUES (?, ?, ?, ?, 'mastered', ?, ?)""",
                    (self.session_id, f"mastered{index}", f"已掌握{index}", f"摘要{index}", now, now),
                )
            memory_text = app_module.build_learner_memory(db, self.session_id)
        memory = json.loads(memory_text.split("\n", 1)[1])
        self.assertEqual(len(memory["needs_attention"]), 4)
        self.assertEqual(len(memory["recently_mastered"]), 2)

    def test_memory_can_be_renamed_unmarked_and_deleted(self):
        response = self.chat("把移项误解为直接改符号", mode="diagnose")
        point_id = response.get_json()["point"]["id"]
        corrected = self.client.patch(f"/knowledge-points/{point_id}", json={
            "session_id": self.session_id,
            "concept": "等式的基本性质",
            "clear_weak_point": True,
        })
        self.assertEqual(corrected.status_code, 200)
        point = corrected.get_json()["point"]
        self.assertEqual(point["concept"], "等式的基本性质")
        self.assertIsNone(point["weak_point"])
        self.assertEqual(point["mastery_level"], "new")

        deleted = self.client.delete(f"/knowledge-points/{point_id}", json={
            "session_id": self.session_id,
        })
        self.assertEqual(deleted.status_code, 200)
        with app_module.get_db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM knowledge_points").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM learning_records").fetchone()[0], 0)

    def test_duplicate_points_merge_without_losing_events_or_attempts(self):
        first = self.chat().get_json()["point"]
        self.generate_and_answer(True)
        self.completions.queue({
            "reply": "这是同一类等式变形。",
            "recordable": True,
            "takeaway": "等式变形要保持两边相等",
            "concept": "等式变形",
            "weak_point": None,
        })
        second_response = self.client.post("/chat", json={
            "session_id": self.session_id,
            "mode": "guide",
            "message": "再讲讲等式变形",
        })
        second = second_response.get_json()["point"]

        collision = self.client.patch(f"/knowledge-points/{first['id']}", json={
            "session_id": self.session_id,
            "concept": second["concept"],
        })
        self.assertEqual(collision.status_code, 409)
        self.assertEqual(collision.get_json()["duplicate_point_id"], second["id"])

        merged = self.client.post("/knowledge-points/merge", json={
            "session_id": self.session_id,
            "source_id": first["id"],
            "target_id": second["id"],
        })
        self.assertEqual(merged.status_code, 200)
        self.assertEqual(merged.get_json()["removed_id"], first["id"])
        with app_module.get_db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM knowledge_points").fetchone()[0], 1)
            linked_events = db.execute(
                "SELECT COUNT(*) FROM learning_records WHERE knowledge_point_id = ?",
                (second["id"],),
            ).fetchone()[0]
            linked_attempts = db.execute(
                "SELECT COUNT(*) FROM practice_attempts WHERE knowledge_point_id = ?",
                (second["id"],),
            ).fetchone()[0]
        self.assertEqual(linked_events, 2)
        self.assertEqual(linked_attempts, 1)

    def test_disputed_assessment_is_excluded_and_weak_point_is_rolled_back(self):
        self.assertEqual(self.chat().status_code, 200)
        point = self.generate_and_answer(False, "等式两边没有做相同运算").get_json()["point"]
        self.assertEqual(point["practice_count"], 1)
        self.assertEqual(point["weak_point"], "等式两边没有做相同运算")
        detail = self.client.get(
            f"/knowledge-points/{point['id']}?session_id={self.session_id}"
        ).get_json()
        self.assertEqual(detail["attempts"][0]["detected_weak_point"], "等式两边没有做相同运算")
        with app_module.get_db() as db:
            attempt_id = db.execute("SELECT id FROM practice_attempts").fetchone()[0]

        disputed = self.client.post(f"/practice/{attempt_id}/dispute", json={
            "session_id": self.session_id,
            "reason": "题目条件有歧义",
        })
        self.assertEqual(disputed.status_code, 200)
        corrected = disputed.get_json()["point"]
        self.assertEqual(corrected["practice_count"], 0)
        self.assertEqual(corrected["correct_streak"], 0)
        self.assertEqual(corrected["incorrect_streak"], 0)
        self.assertEqual(corrected["mastery_level"], "new")
        self.assertIsNone(corrected["weak_point"])
        self.assertEqual(
            self.client.post(f"/practice/{attempt_id}/dispute", json={
                "session_id": self.session_id,
            }).status_code,
            409,
        )


if __name__ == "__main__":
    unittest.main()
