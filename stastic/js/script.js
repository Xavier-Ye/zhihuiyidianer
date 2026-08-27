const elements = {
    messages: document.getElementById("messages"),
    input: document.getElementById("userInput"),
    send: document.getElementById("sendBtn"),
    clear: document.getElementById("clearBtn"),
    tabs: [...document.querySelectorAll(".mode-tab")],
    modeNote: document.getElementById("modeNote"),
    inputHint: document.getElementById("inputHint"),
    charCount: document.getElementById("charCount"),
    quickQuestions: document.getElementById("quickQuestions"),
    learnedList: document.getElementById("learnedList"),
    questionCount: document.getElementById("questionCount"),
    learnedCount: document.getElementById("learnedCount"),
    focusMinutes: document.getElementById("focusMinutes"),
    goalText: document.getElementById("goalText"),
    goalProgress: document.getElementById("goalProgress"),
    todayLabel: document.getElementById("todayLabel"),
    toast: document.getElementById("toast"),
    viewTabs: [...document.querySelectorAll(".view-tab")],
    learningView: document.getElementById("learningView"),
    reviewView: document.getElementById("reviewView"),
    reviewList: document.getElementById("reviewList"),
    reviewTotal: document.getElementById("reviewTotal"),
    reviewPracticing: document.getElementById("reviewPracticing"),
    reviewMastered: document.getElementById("reviewMastered"),
    reviewWeak: document.getElementById("reviewWeak"),
    practiceDialog: document.getElementById("practiceDialog"),
    practiceTitle: document.getElementById("practiceTitle"),
    practiceConcept: document.getElementById("practiceConcept"),
    practiceQuestion: document.getElementById("practiceQuestion"),
    practiceAnswer: document.getElementById("practiceAnswer"),
    practiceFeedback: document.getElementById("practiceFeedback"),
    practiceSubmit: document.getElementById("practiceSubmit"),
    practiceAgain: document.getElementById("practiceAgain"),
    profileBtn: document.getElementById("profileBtn"),
    profileDialog: document.getElementById("profileDialog"),
    profileForm: document.getElementById("profileForm"),
    profileClose: document.getElementById("profileClose"),
    profileGrade: document.getElementById("profileGrade"),
    profileSubject: document.getElementById("profileSubject"),
    profileStyle: document.getElementById("profileStyle"),
    memoryErrorList: document.getElementById("memoryErrorList"),
    profileDelete: document.getElementById("profileDelete"),
    memoryClear: document.getElementById("memoryClear"),
    memoryDialog: document.getElementById("memoryDialog"),
    memoryForm: document.getElementById("memoryForm"),
    memoryClose: document.getElementById("memoryClose"),
    memoryConcept: document.getElementById("memoryConcept"),
    memoryWeakCard: document.getElementById("memoryWeakCard"),
    memoryWeakText: document.getElementById("memoryWeakText"),
    memoryClearWeak: document.getElementById("memoryClearWeak"),
    memoryMergeTarget: document.getElementById("memoryMergeTarget"),
    memoryMerge: document.getElementById("memoryMerge"),
    memoryAttemptList: document.getElementById("memoryAttemptList"),
    memoryDelete: document.getElementById("memoryDelete"),
    mic: document.getElementById("micBtn"),
    speechStatus: document.getElementById("speechStatus"),
    autoSpeak: document.getElementById("autoSpeakBtn"),
};

const MODES = {
    guide: {
        icon: "⌁",
        title: "引导模式",
        description: "我会用问题和小提示，陪你自己走到答案。",
        hint: "引导模式 · 按 Enter 发送，Shift + Enter 换行",
        questions: ["帮我理解一个新概念", "这道题我卡住了，给我一个提示", "先问问我已经知道什么"],
    },
    direct: {
        icon: "→",
        title: "直接模式",
        description: "我会先给结论，再补上最必要的解释。",
        hint: "直接模式 · 简洁回答，不绕弯",
        questions: ["用一句话解释这个概念", "直接告诉我这题怎么做", "帮我总结三个要点"],
    },
    diagnose: {
        icon: "⌕",
        title: "溯源诊断",
        description: "我会逐层追问，和你一起找到真正的知识断点。",
        hint: "溯源模式 · 不怕答错，我们从卡点往回找",
        questions: ["这道题我总做错，帮我找原因", "我好像懂了但不会用", "从基础开始检查我的理解"],
    },
};

const state = {
    sessionId: getSessionId(),
    mode: localStorage.getItem("xiaoyi-mode") || "guide",
    loading: false,
    records: [],
    points: [],
    thinkingTimer: null,
    activePractice: null,
    profile: {
        grade_level: "",
        primary_subject: "",
        preferred_style: "balanced",
    },
    commonErrors: [],
    allPoints: [],
    activeMemoryPointId: null,
    recognition: null,
    listening: false,
    recognitionBaseText: "",
    recognitionFinalText: "",
    recognitionHadError: false,
    suppressRecognitionEndStatus: false,
    speechSupported: false,
    currentUtterance: null,
    currentSpeakButton: null,
    voices: [],
    autoSpeak: localStorage.getItem("xiaoyi-auto-speak") === "true",
};

function getSessionId() {
    const saved = localStorage.getItem("xiaoyi-session-id");
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    const next = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");
    localStorage.setItem("xiaoyi-session-id", next);
    return next;
}

function formatToday() {
    const text = new Intl.DateTimeFormat("zh-CN", {
        month: "long",
        day: "numeric",
        weekday: "long",
    }).format(new Date());
    elements.todayLabel.textContent = `${text} · 一起学会一点`;
}

function setView(view) {
    const showReview = view === "review";
    elements.learningView.hidden = showReview;
    elements.reviewView.hidden = !showReview;
    elements.clear.hidden = showReview;
    elements.viewTabs.forEach((tab) => {
        const active = tab.dataset.view === view;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    if (showReview) renderReview();
    else elements.input.focus();
}

function renderProfile() {
    const profile = state.profile || {};
    elements.profileGrade.value = profile.grade_level || "";
    elements.profileSubject.value = profile.primary_subject || "";
    elements.profileStyle.value = profile.preferred_style || "balanced";
    const hasProfile = Boolean(profile.grade_level || profile.primary_subject || profile.preferred_style !== "balanced");
    elements.profileBtn.classList.toggle("has-profile", hasProfile);
    elements.profileBtn.textContent = profile.primary_subject || (hasProfile ? "画像已设置" : "学习画像");

    elements.memoryErrorList.innerHTML = "";
    if (!state.commonErrors.length) {
        const empty = document.createElement("p");
        empty.className = "memory-error-empty";
        empty.textContent = "还没有明确的错误证据。完成诊断或练习后，这里会逐渐形成记录。";
        elements.memoryErrorList.appendChild(empty);
        return;
    }
    state.commonErrors.forEach((item) => {
        const row = document.createElement("div");
        row.className = "memory-error-item";
        const concept = document.createElement("strong");
        concept.textContent = item.concept;
        row.append(concept, document.createTextNode(item.weak_point));
        elements.memoryErrorList.appendChild(row);
    });
}

async function loadProfile(quiet = false) {
    try {
        const response = await fetch(`/profile?session_id=${encodeURIComponent(state.sessionId)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "画像暂时没有加载出来");
        state.profile = data.profile;
        state.commonErrors = data.common_errors || [];
        renderProfile();
    } catch (error) {
        if (!quiet) showToast(error.message || "画像暂时没有加载出来");
    }
}

function openProfile() {
    renderProfile();
    if (elements.profileDialog.open) return;
    if (typeof elements.profileDialog.showModal === "function") elements.profileDialog.showModal();
    else elements.profileDialog.setAttribute("open", "");
}

async function saveProfile(event) {
    event.preventDefault();
    const saveButton = elements.profileForm.querySelector(".profile-save");
    saveButton.disabled = true;
    try {
        const response = await fetch("/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.sessionId,
                grade_level: elements.profileGrade.value,
                primary_subject: elements.profileSubject.value.trim(),
                preferred_style: elements.profileStyle.value,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "画像暂时没有保存");
        state.profile = data.profile;
        state.commonErrors = data.common_errors || [];
        renderProfile();
        elements.profileDialog.close();
        showToast("小一已经记住你的学习偏好");
    } catch (error) {
        showToast(error.message || "画像暂时没有保存");
    } finally {
        saveButton.disabled = false;
    }
}

async function deleteProfile(clearLearningMemory = false) {
    const message = clearLearningMemory
        ? "清空画像、知识点、薄弱点和练习记录吗？聊天记录不会被删除。此操作无法撤销。"
        : "删除年级、学科和讲解偏好吗？知识点与练习记录会继续保留。";
    if (!window.confirm(message)) return;
    try {
        const response = await fetch("/profile", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.sessionId,
                clear_learning_memory: clearLearningMemory,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "暂时没有删除成功");
        state.profile = data.profile;
        state.commonErrors = data.common_errors || [];
        if (clearLearningMemory) {
            state.points = [];
            state.records = [];
            renderRecords();
            renderReview();
            updateStats(data.stats);
        }
        renderProfile();
        showToast(clearLearningMemory ? "长期学习记忆已清空" : "学习画像已删除");
    } catch (error) {
        showToast(error.message || "暂时没有删除成功");
    }
}

function openMemoryDialog() {
    if (elements.memoryDialog.open) return;
    if (typeof elements.memoryDialog.showModal === "function") elements.memoryDialog.showModal();
    else elements.memoryDialog.setAttribute("open", "");
}

function renderMemoryAttempts(attempts) {
    elements.memoryAttemptList.innerHTML = "";
    if (!attempts.length) {
        const empty = document.createElement("div");
        empty.className = "attempt-empty";
        empty.textContent = "这个知识点还没有已完成的练习。";
        elements.memoryAttemptList.appendChild(empty);
        return;
    }

    attempts.forEach((attempt) => {
        const item = document.createElement("article");
        const statusClass = attempt.disputed_at ? "disputed" : (attempt.is_correct ? "correct" : "incorrect");
        item.className = `attempt-item ${statusClass}`;
        const head = document.createElement("div");
        head.className = "attempt-item-head";
        const status = document.createElement("strong");
        status.textContent = attempt.disputed_at ? "已提出异议" : (attempt.is_correct ? "判定正确" : "判定需巩固");
        const date = document.createElement("span");
        const answeredAt = new Date(attempt.answered_at);
        date.textContent = Number.isNaN(answeredAt.getTime()) ? "练习记录" : answeredAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
        head.append(status, date);

        const question = document.createElement("p");
        question.textContent = attempt.question;
        const answer = document.createElement("p");
        answer.className = "attempt-answer";
        answer.textContent = `你的回答：${attempt.answer || "未记录"}`;
        const feedback = document.createElement("p");
        feedback.textContent = attempt.disputed_at
            ? `异议：${attempt.dispute_reason}`
            : `小一反馈：${attempt.feedback || "无"}`;
        item.append(head, question, answer, feedback);

        if (!attempt.disputed_at) {
            const dispute = document.createElement("button");
            dispute.type = "button";
            dispute.dataset.disputeAttempt = attempt.id;
            dispute.textContent = "我认为判定有误";
            item.appendChild(dispute);
        }
        elements.memoryAttemptList.appendChild(item);
    });
}

function renderMemoryEditor(point, attempts, allPoints) {
    state.activeMemoryPointId = point.id;
    state.allPoints = allPoints;
    elements.memoryConcept.value = point.concept || "";
    elements.memoryConcept.disabled = false;
    elements.memoryDelete.disabled = false;
    elements.memoryForm.querySelector(".memory-save").disabled = false;
    elements.memoryClearWeak.disabled = false;
    elements.memoryWeakCard.hidden = !point.weak_point;
    elements.memoryWeakText.textContent = point.weak_point || "";
    elements.memoryMergeTarget.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "选择保留的知识点";
    elements.memoryMergeTarget.appendChild(placeholder);
    allPoints.filter((item) => item.id !== point.id).forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.concept;
        elements.memoryMergeTarget.appendChild(option);
    });
    const hasMergeTarget = allPoints.some((item) => item.id !== point.id);
    elements.memoryMergeTarget.disabled = !hasMergeTarget;
    elements.memoryMerge.disabled = !hasMergeTarget;
    renderMemoryAttempts(attempts);
}

async function openMemory(pointId) {
    state.activeMemoryPointId = Number(pointId);
    elements.memoryConcept.value = "正在加载……";
    elements.memoryConcept.disabled = true;
    elements.memoryDelete.disabled = true;
    elements.memoryForm.querySelector(".memory-save").disabled = true;
    elements.memoryClearWeak.disabled = true;
    elements.memoryMerge.disabled = true;
    elements.memoryWeakCard.hidden = true;
    elements.memoryMergeTarget.innerHTML = "<option>正在加载……</option>";
    elements.memoryAttemptList.innerHTML = '<div class="attempt-empty">正在读取练习证据……</div>';
    openMemoryDialog();
    try {
        const [detailResponse, listResponse] = await Promise.all([
            fetch(`/knowledge-points/${pointId}?session_id=${encodeURIComponent(state.sessionId)}`),
            fetch(`/knowledge-points?session_id=${encodeURIComponent(state.sessionId)}`),
        ]);
        const detail = await detailResponse.json().catch(() => ({}));
        const list = await listResponse.json().catch(() => ({}));
        if (!detailResponse.ok) throw new Error(detail.error || "学习记忆暂时没有加载出来");
        if (!listResponse.ok) throw new Error(list.error || "知识点列表暂时没有加载出来");
        renderMemoryEditor(detail.point, detail.attempts || [], list.points || []);
    } catch (error) {
        elements.memoryAttemptList.innerHTML = "";
        const failure = document.createElement("div");
        failure.className = "attempt-empty";
        failure.textContent = error.message || "学习记忆暂时没有加载出来";
        elements.memoryAttemptList.appendChild(failure);
    }
}

async function patchMemory(changes, successMessage) {
    if (!state.activeMemoryPointId) return null;
    const response = await fetch(`/knowledge-points/${state.activeMemoryPointId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.sessionId, ...changes }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "学习记忆暂时没有更新");
    mergePoint(data.point);
    const allPointIndex = state.allPoints.findIndex((item) => item.id === data.point.id);
    if (allPointIndex >= 0) state.allPoints[allPointIndex] = data.point;
    renderRecords();
    renderReview();
    loadProfile(true);
    if (successMessage) showToast(successMessage);
    return data.point;
}

async function saveMemoryName(event) {
    event.preventDefault();
    const concept = elements.memoryConcept.value.trim();
    if (!concept) {
        showToast("知识点名称不能为空");
        return;
    }
    const save = elements.memoryForm.querySelector(".memory-save");
    save.disabled = true;
    try {
        const point = await patchMemory({ concept }, "知识点名称已更新");
        if (point) elements.memoryConcept.value = point.concept;
    } catch (error) {
        showToast(error.message || "知识点名称暂时没有更新");
    } finally {
        save.disabled = false;
    }
}

async function clearMemoryWeakPoint() {
    try {
        const point = await patchMemory({ clear_weak_point: true }, "这个薄弱点已移除");
        if (point) {
            elements.memoryWeakCard.hidden = true;
            elements.memoryWeakText.textContent = "";
        }
    } catch (error) {
        showToast(error.message || "薄弱点暂时没有移除");
    }
}

async function mergeMemoryPoint() {
    const targetId = Number(elements.memoryMergeTarget.value);
    const sourceId = state.activeMemoryPointId;
    if (!targetId || !sourceId) {
        showToast("先选择要保留的知识点");
        return;
    }
    const target = state.allPoints.find((item) => item.id === targetId);
    const source = state.allPoints.find((item) => item.id === sourceId);
    if (!window.confirm(`把“${source?.concept || "当前知识点"}”合并到“${target?.concept || "所选知识点"}”吗？`)) return;
    try {
        const response = await fetch("/knowledge-points/merge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: state.sessionId, source_id: sourceId, target_id: targetId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "知识点暂时没有合并");
        state.points = state.points.filter((item) => item.id !== data.removed_id);
        state.records = state.records.filter((item) => item.id !== data.removed_id);
        mergePoint(data.point);
        renderRecords();
        renderReview();
        updateStats(data.stats);
        loadProfile(true);
        elements.memoryDialog.close();
        showToast("重复知识点已经合并");
    } catch (error) {
        showToast(error.message || "知识点暂时没有合并");
    }
}

async function deleteMemoryPoint() {
    const point = state.allPoints.find((item) => item.id === state.activeMemoryPointId);
    if (!window.confirm(`删除“${point?.concept || "这条学习记忆"}”及其练习记录吗？此操作无法撤销。`)) return;
    try {
        const response = await fetch(`/knowledge-points/${state.activeMemoryPointId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: state.sessionId }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "学习记忆暂时没有删除");
        state.points = state.points.filter((item) => item.id !== data.deleted_id);
        state.records = state.records.filter((item) => item.id !== data.deleted_id);
        renderRecords();
        renderReview();
        updateStats(data.stats);
        loadProfile(true);
        elements.memoryDialog.close();
        showToast("这条学习记忆已删除");
    } catch (error) {
        showToast(error.message || "学习记忆暂时没有删除");
    }
}

async function disputeAttempt(attemptId) {
    const reason = window.prompt("哪里判得不准确？可以简单说明，也可以留空。", "");
    if (reason === null) return;
    try {
        const response = await fetch(`/practice/${attemptId}/dispute`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: state.sessionId, reason }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "异议暂时没有提交");
        mergePoint(data.point);
        renderRecords();
        renderReview();
        updateStats(data.stats);
        loadProfile(true);
        showToast("这次判定已排除，掌握状态已重新计算");
        await openMemory(data.point.id);
    } catch (error) {
        showToast(error.message || "异议暂时没有提交");
    }
}

function setMode(mode, announce = true) {
    if (!MODES[mode]) return;
    state.mode = mode;
    localStorage.setItem("xiaoyi-mode", mode);
    elements.tabs.forEach((tab) => {
        const active = tab.dataset.mode === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
    });
    const info = MODES[mode];
    elements.modeNote.innerHTML = "";
    const icon = document.createElement("span");
    icon.className = "note-icon";
    icon.textContent = info.icon;
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const description = document.createElement("p");
    title.textContent = info.title;
    description.textContent = info.description;
    copy.append(title, description);
    elements.modeNote.append(icon, copy);
    elements.modeNote.style.borderLeftColor = mode === "diagnose" ? "var(--rust)" : "var(--green)";
    elements.inputHint.textContent = info.hint;
    renderQuickQuestions(info.questions);
    if (announce) showToast(`已切换到${info.title}`);
}

function renderQuickQuestions(questions) {
    elements.quickQuestions.innerHTML = "";
    questions.forEach((question) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.question = question;
        button.textContent = question;
        button.addEventListener("click", () => {
            elements.input.value = question;
            resizeInput();
            elements.input.focus();
        });
        elements.quickQuestions.appendChild(button);
    });
}

function showSpeechStatus(message = "", type = "") {
    elements.speechStatus.textContent = message;
    elements.speechStatus.className = `speech-status${type ? ` ${type}` : ""}`;
    elements.speechStatus.hidden = !message;
}

function updateMicState(listening) {
    state.listening = listening;
    elements.mic.classList.toggle("listening", listening);
    elements.mic.setAttribute("aria-pressed", String(listening));
    elements.mic.setAttribute("aria-label", listening ? "停止语音输入" : "开始语音输入");
}

function setSpeakButtonState(button, speaking) {
    if (!button) return;
    button.classList.toggle("speaking", speaking);
    button.textContent = speaking ? "停止" : "朗读";
    button.setAttribute("aria-label", speaking ? "停止朗读这条回复" : "朗读这条回复");
}

function cancelSpeaking() {
    if (!state.speechSupported) return;
    window.speechSynthesis.cancel();
    setSpeakButtonState(state.currentSpeakButton, false);
    state.currentSpeakButton = null;
    state.currentUtterance = null;
}

function stopRecognition(suppressStatus = false) {
    if (!state.recognition || !state.listening) return;
    state.suppressRecognitionEndStatus = suppressStatus;
    updateMicState(false);
    elements.input.readOnly = false;
    if (suppressStatus) showSpeechStatus("");
    state.recognition.abort();
}

function preferredChineseVoice() {
    return state.voices.find((voice) => /^zh[-_]?CN$/i.test(voice.lang))
        || state.voices.find((voice) => /^zh/i.test(voice.lang))
        || null;
}

function speakText(text, button) {
    if (!state.speechSupported || !text.trim()) {
        showSpeechStatus("当前浏览器无法朗读回复。", "error");
        return;
    }
    stopRecognition(true);
    cancelSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = preferredChineseVoice();
    utterance.lang = voice?.lang || "zh-CN";
    utterance.rate = 0.95;
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
        if (state.currentUtterance !== utterance) return;
        setSpeakButtonState(button, false);
        state.currentSpeakButton = null;
        state.currentUtterance = null;
    };
    utterance.onerror = (event) => {
        if (state.currentUtterance !== utterance) return;
        setSpeakButtonState(button, false);
        state.currentSpeakButton = null;
        state.currentUtterance = null;
        if (event.error !== "canceled" && event.error !== "interrupted") {
            showSpeechStatus("朗读没有成功，请稍后再试。", "error");
        }
    };

    state.currentUtterance = utterance;
    state.currentSpeakButton = button;
    setSpeakButtonState(button, true);
    showSpeechStatus("");
    window.speechSynthesis.speak(utterance);
}

function toggleSpeak(text, button) {
    if (state.currentSpeakButton === button) {
        cancelSpeaking();
        return;
    }
    speakText(text, button);
}

function recognitionErrorMessage(code) {
    const messages = {
        "not-allowed": "无法使用麦克风，请在浏览器地址栏允许权限后重试。",
        "service-not-allowed": "浏览器已阻止语音识别服务，请检查权限与浏览器设置。",
        "no-speech": "没有听清内容，请靠近麦克风后再试一次。",
        "audio-capture": "没有找到可用的麦克风，请检查设备连接。",
        network: "语音识别服务暂时无法连接，请检查网络后重试。",
    };
    return messages[code] || "语音识别没有成功，请稍后再试。";
}

function displayRecognitionText(finalText, interimText = "") {
    const spokenText = `${finalText}${interimText}`.trim();
    const separator = state.recognitionBaseText && spokenText ? " " : "";
    elements.input.value = `${state.recognitionBaseText}${separator}${spokenText}`;
    resizeInput();
}

function startRecognition() {
    if (!state.recognition) return;
    if (state.listening) {
        state.recognition.stop();
        return;
    }

    cancelSpeaking();
    state.recognitionBaseText = elements.input.value.trimEnd();
    state.recognitionFinalText = "";
    state.recognitionHadError = false;
    state.suppressRecognitionEndStatus = false;
    elements.input.readOnly = true;
    updateMicState(true);
    showSpeechStatus("正在聆听……语音可能由浏览器的识别服务处理。点击麦克风可停止。", "listening");
    try {
        state.recognition.start();
    } catch (error) {
        elements.input.readOnly = false;
        updateMicState(false);
        showSpeechStatus("麦克风还没有准备好，请稍后再试。", "error");
    }
}

function updateAutoSpeakButton() {
    elements.autoSpeak.setAttribute("aria-pressed", String(state.autoSpeak));
    elements.autoSpeak.textContent = `朗读：${state.autoSpeak ? "开" : "关"}`;
    elements.autoSpeak.title = state.autoSpeak
        ? "AI 回复后会自动朗读，点击关闭"
        : "AI 回复后自动朗读，默认关闭";
}

function initSpeech() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    const recognitionAvailable = Boolean(SpeechRecognitionClass) && (window.isSecureContext || isLocalhost);

    state.speechSupported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
    if (state.speechSupported) {
        const loadVoices = () => { state.voices = window.speechSynthesis.getVoices(); };
        loadVoices();
        window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
        updateAutoSpeakButton();
    } else {
        state.autoSpeak = false;
        elements.autoSpeak.disabled = true;
        elements.autoSpeak.textContent = "朗读不可用";
        elements.autoSpeak.title = "当前浏览器不支持语音朗读";
    }

    if (!recognitionAvailable) {
        elements.mic.disabled = true;
        if (!SpeechRecognitionClass) {
            elements.mic.title = "当前浏览器不支持语音识别，建议使用 Chrome 或 Edge";
            elements.mic.setAttribute("aria-label", "语音输入不可用，仍可键盘输入");
            showSpeechStatus("当前浏览器不支持语音识别，可继续键盘输入；建议使用 Chrome 或 Edge。", "error");
        } else {
            elements.mic.title = "语音识别需要 HTTPS 或 localhost 环境";
            elements.mic.setAttribute("aria-label", "语音输入需要安全连接");
            showSpeechStatus("语音输入需要 HTTPS 或 localhost 环境，文字聊天仍可正常使用。", "error");
        }
        return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = 0; index < event.results.length; index += 1) {
            const transcript = event.results[index][0]?.transcript || "";
            if (event.results[index].isFinal) finalText += transcript;
            else interimText += transcript;
        }
        state.recognitionFinalText = finalText;
        displayRecognitionText(finalText, interimText);
    };
    recognition.onerror = (event) => {
        if (event.error === "aborted" && state.suppressRecognitionEndStatus) return;
        state.recognitionHadError = true;
        showSpeechStatus(recognitionErrorMessage(event.error), "error");
    };
    recognition.onend = () => {
        elements.input.readOnly = false;
        updateMicState(false);
        if (state.suppressRecognitionEndStatus) {
            state.suppressRecognitionEndStatus = false;
            return;
        }
        if (state.recognitionHadError) return;
        if (elements.input.value.trim() !== state.recognitionBaseText.trim()) {
            showSpeechStatus("已转成文字，请检查或修改后再发送。", "");
            elements.input.focus();
        } else {
            showSpeechStatus("没有听清内容，请再试一次。", "error");
        }
    };
    state.recognition = recognition;
    elements.mic.title = "语音转文字；内容可能由浏览器服务处理，转写后需手动发送";
}

function renderMath(container) {
    if (typeof window.renderMathInElement !== "function") return;
    try {
        window.renderMathInElement(container, {
            delimiters: [
                { left: "$$", right: "$$", display: true },
                { left: "\\[", right: "\\]", display: true },
                { left: "\\(", right: "\\)", display: false },
                { left: "$", right: "$", display: false },
            ],
            throwOnError: false,
            strict: false,
        });
    } catch (error) {
        console.warn("Math rendering failed", error);
    }
}

function createMessage(text, sender, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = `message ${sender}`;
    if (options.id) wrapper.id = options.id;

    const avatar = document.createElement("div");
    avatar.className = sender === "user" ? "avatar user-avatar" : "avatar";
    if (sender === "bot") {
        const img = document.createElement("img");
        img.src = "/static/images/xiaoyi.png";
        img.alt = "小一";
        avatar.appendChild(img);
    } else {
        avatar.textContent = "你";
    }

    const body = document.createElement("div");
    const speaker = document.createElement("span");
    speaker.className = "speaker";
    speaker.textContent = sender === "bot" ? "小一" : "你";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (options.contentNode) bubble.appendChild(options.contentNode);
    else {
        bubble.textContent = text;
        renderMath(bubble);
    }
    body.append(speaker, bubble);
    if (sender === "bot" && typeof text === "string" && text.trim()) {
        const actions = document.createElement("div");
        actions.className = "message-actions";
        const speakButton = document.createElement("button");
        speakButton.type = "button";
        speakButton.className = "speak-button";
        speakButton.textContent = state.speechSupported ? "朗读" : "朗读不可用";
        speakButton.disabled = !state.speechSupported;
        speakButton.setAttribute("aria-label", state.speechSupported ? "朗读这条回复" : "当前浏览器无法朗读这条回复");
        speakButton.addEventListener("click", () => toggleSpeak(text, speakButton));
        actions.appendChild(speakButton);
        body.appendChild(actions);
    }
    wrapper.append(avatar, body);
    elements.messages.appendChild(wrapper);
    scrollToBottom();
    return wrapper;
}

function showThinking() {
    const indicator = document.createElement("div");
    indicator.className = "typing-indicator";
    const copy = document.createElement("span");
    copy.className = "thinking-copy";
    const labels = state.mode === "diagnose"
        ? ["小一在回看你的线索", "正在定位可能的卡点", "再往前想一层"]
        : ["小一正在想", "把问题拆小一点", "整理成好懂的话"];
    copy.textContent = labels[0];
    indicator.append(copy);
    for (let i = 0; i < 3; i += 1) indicator.appendChild(document.createElement("i"));
    createMessage("", "bot", { id: "thinkingMessage", contentNode: indicator });
    let index = 0;
    state.thinkingTimer = window.setInterval(() => {
        index = (index + 1) % labels.length;
        copy.textContent = labels[index];
    }, 1600);
}

function hideThinking() {
    window.clearInterval(state.thinkingTimer);
    state.thinkingTimer = null;
    document.getElementById("thinkingMessage")?.remove();
}

function createErrorMessage(message, originalQuestion) {
    const box = document.createElement("div");
    const copy = document.createElement("p");
    copy.textContent = message;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "retry-button";
    retry.textContent = "再试一次";
    retry.addEventListener("click", () => {
        elements.input.value = originalQuestion;
        box.closest(".message")?.remove();
        sendMessage({ reuseUserMessage: true });
    });
    box.append(copy, retry);
    createMessage("", "bot", { contentNode: box });
}

async function sendMessage(options = {}) {
    const message = elements.input.value.trim();
    if (!message || state.loading) return;

    stopRecognition(true);
    cancelSpeaking();
    state.loading = true;
    elements.send.disabled = true;
    if (!options.reuseUserMessage) createMessage(message, "user");
    elements.input.value = "";
    resizeInput();
    showThinking();

    try {
        const response = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, mode: state.mode, session_id: state.sessionId }),
        });
        const data = await response.json().catch(() => ({}));
        hideThinking();
        if (!response.ok) throw new Error(data.error || "小一暂时没接住这个问题。");
        const replyMessage = createMessage(data.reply, "bot");
        if (state.autoSpeak) {
            const speakButton = replyMessage.querySelector(".speak-button");
            if (speakButton) speakText(data.reply, speakButton);
        }
        if (data.point || data.record) {
            mergePoint(data.point || data.record);
            renderRecords();
            renderReview();
            loadProfile(true);
            showToast("已经替你记下今天学会的一点");
        }
        updateStats(data.stats);
    } catch (error) {
        hideThinking();
        createErrorMessage(error.message || "网络好像打了个盹，请稍后再试。", message);
    } finally {
        state.loading = false;
        elements.send.disabled = false;
        elements.input.focus();
    }
}

async function loadHistory() {
    try {
        const response = await fetch(`/history?session_id=${encodeURIComponent(state.sessionId)}`);
        if (!response.ok) throw new Error("history unavailable");
        const data = await response.json();
        if (data.messages?.length) {
            elements.messages.querySelector(".welcome-message")?.remove();
            data.messages.forEach((item) => createMessage(item.content, item.role === "assistant" ? "bot" : "user"));
        }
        state.points = data.points || data.records || [];
        state.records = state.points.slice(0, 8);
        renderRecords();
        renderReview();
        updateStats(data.stats);
    } catch (error) {
        showToast("旧记录暂时没有加载出来，不影响继续提问");
    }
}

async function clearConversation() {
    if (state.loading) return;
    const confirmed = window.confirm("清空本次对话吗？“会了一点”记录会继续保留。此操作无法撤销。\n\nClear this conversation?");
    if (!confirmed) return;
    stopRecognition(true);
    cancelSpeaking();
    try {
        const response = await fetch("/history", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: state.sessionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "清空失败");
        elements.messages.innerHTML = "";
        createMessage("对话已经清空啦。过去的收获还在，我们随时从新问题开始。", "bot");
        updateStats(data.stats);
        showToast("本次对话已清空");
    } catch (error) {
        showToast(error.message || "暂时没能清空，请稍后再试");
    }
}

function renderRecords() {
    elements.learnedList.innerHTML = "";
    if (!state.records.length) {
        const empty = document.createElement("div");
        empty.className = "empty-learned";
        empty.innerHTML = "<span>☁</span><p>完成一次对话后，<br>小一会替你记下收获。</p>";
        elements.learnedList.appendChild(empty);
        return;
    }
    state.records.forEach((record) => {
        const item = document.createElement("article");
        item.className = `learned-item ${record.mastery_level || "new"}`;
        const title = document.createElement("strong");
        title.textContent = record.concept || record.summary;
        const summary = document.createElement("p");
        summary.className = "learned-summary";
        summary.textContent = record.summary;
        const time = document.createElement("small");
        const date = new Date(record.last_seen_at || record.created_at);
        time.textContent = Number.isNaN(date.getTime()) ? "刚刚记下" : `${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} · ${masteryLabel(record.mastery_level)}`;
        const practice = document.createElement("button");
        practice.type = "button";
        practice.className = "mini-practice-button";
        practice.dataset.pointId = record.id;
        practice.textContent = "再来一题";
        const manage = document.createElement("button");
        manage.type = "button";
        manage.className = "memory-manage-button";
        manage.dataset.managePoint = record.id;
        manage.textContent = "管理记忆";
        item.append(title);
        if (record.summary && record.summary !== title.textContent) item.appendChild(summary);
        item.append(time, practice, manage);
        elements.learnedList.appendChild(item);
    });
}

function masteryLabel(level) {
    return ({ new: "刚刚接触", practicing: "正在巩固", mastered: "已经掌握" })[level] || "刚刚接触";
}

function mergePoint(point) {
    if (!point?.id) return;
    const index = state.points.findIndex((item) => item.id === point.id);
    if (index >= 0) state.points[index] = point;
    else state.points.push(point);
    const priority = { practicing: 0, new: 1, mastered: 2 };
    state.points.sort((a, b) => {
        const byMastery = (priority[a.mastery_level] ?? 1) - (priority[b.mastery_level] ?? 1);
        if (byMastery) return byMastery;
        return String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || ""));
    });
    state.records = state.points.slice(0, 8);
}

function renderReview() {
    const points = state.points;
    elements.reviewTotal.textContent = points.length;
    elements.reviewPracticing.textContent = points.filter((point) => point.mastery_level === "practicing").length;
    elements.reviewMastered.textContent = points.filter((point) => point.mastery_level === "mastered").length;
    elements.reviewWeak.textContent = points.filter((point) => point.weak_point).length;
    elements.reviewList.innerHTML = "";

    if (!points.length) {
        const empty = document.createElement("div");
        empty.className = "review-empty";
        empty.innerHTML = "<span>☁</span><h3>今天还没有知识点</h3><p>完成一次对话后，收获会自动归到这里。</p>";
        const back = document.createElement("button");
        back.type = "button";
        back.textContent = "去问一个问题";
        back.addEventListener("click", () => setView("learn"));
        empty.appendChild(back);
        elements.reviewList.appendChild(empty);
        return;
    }

    points.forEach((point) => {
        const card = document.createElement("article");
        card.className = `review-item ${point.mastery_level || "new"}`;

        const head = document.createElement("div");
        head.className = "review-item-head";
        const concept = document.createElement("div");
        const kicker = document.createElement("small");
        kicker.textContent = "知识点";
        const title = document.createElement("h3");
        title.textContent = point.concept || point.summary;
        concept.append(kicker, title);
        const badge = document.createElement("span");
        badge.className = "mastery-badge";
        badge.textContent = masteryLabel(point.mastery_level);
        head.append(concept, badge);

        card.appendChild(head);
        const summary = document.createElement("p");
        summary.className = "review-summary";
        summary.textContent = point.summary;
        if (point.summary && point.summary !== title.textContent) card.appendChild(summary);
        if (point.weak_point) {
            const weak = document.createElement("p");
            weak.className = "weak-point";
            const label = document.createElement("strong");
            label.textContent = "当前卡点";
            weak.append(label, document.createTextNode(point.weak_point));
            card.appendChild(weak);
        }

        const foot = document.createElement("div");
        foot.className = "review-item-foot";
        const evidence = document.createElement("span");
        const practiceCount = Number(point.practice_count || 0);
        const streak = Number(point.correct_streak || 0);
        evidence.textContent = practiceCount ? `已练 ${practiceCount} 次 · 连续答对 ${streak} 次` : "还没有练习证据";
        const practice = document.createElement("button");
        practice.type = "button";
        practice.className = "practice-button";
        practice.dataset.pointId = point.id;
        practice.textContent = point.mastery_level === "mastered" ? "换题复习" : "再来一题";
        const manage = document.createElement("button");
        manage.type = "button";
        manage.className = "memory-manage-button";
        manage.dataset.managePoint = point.id;
        manage.textContent = "管理记忆";
        const actions = document.createElement("div");
        actions.className = "review-card-actions";
        actions.append(manage, practice);
        foot.append(evidence, actions);
        card.appendChild(foot);
        elements.reviewList.appendChild(card);
    });
}

function openPracticeDialog() {
    if (elements.practiceDialog.open) return;
    if (typeof elements.practiceDialog.showModal === "function") elements.practiceDialog.showModal();
    else elements.practiceDialog.setAttribute("open", "");
}

async function startPractice(pointId) {
    const point = state.points.find((item) => String(item.id) === String(pointId));
    if (!point) return;
    state.activePractice = { pointId: point.id, attemptId: null };
    elements.practiceTitle.textContent = "再来一题";
    elements.practiceConcept.textContent = point.concept || point.summary;
    elements.practiceQuestion.textContent = "正在根据这个知识点准备题目……";
    elements.practiceAnswer.value = "";
    elements.practiceAnswer.disabled = true;
    elements.practiceFeedback.hidden = true;
    elements.practiceFeedback.className = "practice-feedback";
    elements.practiceSubmit.disabled = true;
    elements.practiceSubmit.hidden = false;
    elements.practiceAgain.hidden = true;
    openPracticeDialog();

    try {
        const response = await fetch("/practice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: state.sessionId, knowledge_point_id: point.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "暂时没有生成题目");
        state.activePractice.attemptId = data.attempt.id;
        const difficultyLabel = {
            foundation: "基础一步",
            consolidation: "针对巩固",
            standard: "理解练习",
            transfer: "迁移挑战",
        }[data.attempt.difficulty] || "再来一题";
        elements.practiceTitle.textContent = difficultyLabel;
        elements.practiceQuestion.textContent = data.attempt.question;
        elements.practiceAnswer.disabled = false;
        elements.practiceSubmit.disabled = false;
        elements.practiceAnswer.focus();
    } catch (error) {
        elements.practiceQuestion.textContent = error.message || "题目暂时没有准备好，请稍后再试。";
        elements.practiceAgain.hidden = false;
    }
}

async function submitPractice() {
    const answer = elements.practiceAnswer.value.trim();
    if (!answer || !state.activePractice?.attemptId) {
        showToast("先写下你的思路吧");
        return;
    }
    elements.practiceSubmit.disabled = true;
    elements.practiceAnswer.disabled = true;
    elements.practiceSubmit.textContent = "正在看看……";

    try {
        const response = await fetch("/practice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: state.sessionId,
                attempt_id: state.activePractice.attemptId,
                answer,
            }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "暂时没有评完这道题");
        mergePoint(data.point);
        renderRecords();
        renderReview();
        updateStats(data.stats);
        loadProfile(true);
        elements.practiceFeedback.textContent = data.feedback;
        elements.practiceFeedback.className = `practice-feedback ${data.correct ? "correct" : "incorrect"}`;
        elements.practiceFeedback.hidden = false;
        elements.practiceSubmit.hidden = true;
        elements.practiceAgain.hidden = false;
        elements.practiceAgain.textContent = data.correct ? "再练一题" : "换个角度再练";
        showToast(data.correct ? "答对了，掌握度向前一步" : "卡点已经记下，下次会更有针对性");
    } catch (error) {
        elements.practiceFeedback.textContent = error.message || "暂时没有评完，请稍后再提交。";
        elements.practiceFeedback.className = "practice-feedback incorrect";
        elements.practiceFeedback.hidden = false;
        elements.practiceAnswer.disabled = false;
        elements.practiceSubmit.disabled = false;
    } finally {
        elements.practiceSubmit.textContent = "提交作答";
    }
}

function updateStats(stats = {}) {
    const questions = Number(stats.questions || 0);
    const learned = Number(stats.learned || 0);
    elements.questionCount.textContent = questions;
    elements.learnedCount.textContent = learned;
    elements.focusMinutes.textContent = Number(stats.minutes || 0);
    elements.goalText.textContent = `${Math.min(learned, 3)} / 3`;
    elements.goalProgress.style.width = `${Math.min(100, (learned / 3) * 100)}%`;
}

function resizeInput() {
    elements.input.style.height = "auto";
    elements.input.style.height = `${Math.min(elements.input.scrollHeight, 100)}px`;
    elements.charCount.textContent = `${elements.input.value.length} / 1000`;
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        elements.messages.scrollTop = elements.messages.scrollHeight;
    });
}

let toastTimer;
function showToast(text) {
    window.clearTimeout(toastTimer);
    elements.toast.textContent = text;
    elements.toast.classList.add("show");
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

elements.tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
elements.send.addEventListener("click", sendMessage);
elements.mic.addEventListener("click", startRecognition);
elements.autoSpeak.addEventListener("click", () => {
    if (!state.speechSupported) return;
    state.autoSpeak = !state.autoSpeak;
    localStorage.setItem("xiaoyi-auto-speak", String(state.autoSpeak));
    updateAutoSpeakButton();
    if (!state.autoSpeak) cancelSpeaking();
});
elements.clear.addEventListener("click", clearConversation);
elements.learnedList.addEventListener("click", (event) => {
    const manage = event.target.closest("[data-manage-point]");
    if (manage) {
        openMemory(manage.dataset.managePoint);
        return;
    }
    const button = event.target.closest("[data-point-id]");
    if (button) startPractice(button.dataset.pointId);
});
elements.reviewList.addEventListener("click", (event) => {
    const manage = event.target.closest("[data-manage-point]");
    if (manage) {
        openMemory(manage.dataset.managePoint);
        return;
    }
    const button = event.target.closest("[data-point-id]");
    if (button) startPractice(button.dataset.pointId);
});
elements.practiceSubmit.addEventListener("click", submitPractice);
elements.practiceAgain.addEventListener("click", () => {
    if (state.activePractice?.pointId) startPractice(state.activePractice.pointId);
});
elements.profileBtn.addEventListener("click", openProfile);
elements.profileClose.addEventListener("click", () => elements.profileDialog.close());
elements.profileForm.addEventListener("submit", saveProfile);
elements.profileDelete.addEventListener("click", () => deleteProfile(false));
elements.memoryClear.addEventListener("click", () => deleteProfile(true));
elements.memoryClose.addEventListener("click", () => elements.memoryDialog.close());
elements.memoryForm.addEventListener("submit", saveMemoryName);
elements.memoryClearWeak.addEventListener("click", clearMemoryWeakPoint);
elements.memoryMerge.addEventListener("click", mergeMemoryPoint);
elements.memoryDelete.addEventListener("click", deleteMemoryPoint);
elements.memoryAttemptList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dispute-attempt]");
    if (button) disputeAttempt(button.dataset.disputeAttempt);
});
elements.input.addEventListener("input", resizeInput);
elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    stopRecognition(true);
    cancelSpeaking();
});
window.addEventListener("beforeunload", () => {
    stopRecognition(true);
    cancelSpeaking();
});

formatToday();
setView("learn");
setMode(state.mode, false);
resizeInput();
initSpeech();
loadHistory();
loadProfile();
elements.input.focus();
