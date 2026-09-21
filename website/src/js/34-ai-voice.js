// ============================================================================
// ---------- محادثة صوتية مع المساعد الذكي ----------
// تحويل الكلام إلى نص يتم محليًا عبر واجهة المتصفح، والرد يمر بنفس مسارات
// المحادثة الحالية حتى تبقى الحدود والسجل والسياق بدون أي مسار احتياطي.
// ============================================================================
(() => {
  const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  const speechOutput = window.speechSynthesis;
  const configs = {
    assistant: {
      buttonId: 'aiConversationVoiceBtn',
      statusId: 'aiConversationVoiceStatus',
      sectionId: 'step-ai-conversation',
      send: transcript => sendAiPayload({ content: transcript, voice_mode: true }, transcript),
    },
    study: {
      buttonId: 'aiStudyVoiceBtn',
      statusId: 'aiStudyVoiceStatus',
      sectionId: 'step-chat',
      send: transcript => sendAIChat({ message: transcript, voiceMode: true }),
    },
  };

  let activeMode = null;
  let recognition = null;
  let replyPending = false;
  let restartTimer = null;
  let fillerTimer = null;

  const getConfig = mode => configs[mode];
  const getButton = mode => document.getElementById(getConfig(mode)?.buttonId);
  const getStatus = mode => document.getElementById(getConfig(mode)?.statusId);

  function setStatus(mode, text, state = '') {
    const status = getStatus(mode);
    if (!status) return;
    status.textContent = text;
    status.classList.remove('hidden', 'is-thinking', 'is-speaking');
    if (state) status.classList.add(`is-${state}`);
  }

  function setButton(mode, active, listening = false) {
    const button = getButton(mode);
    if (!button) return;
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-listening', active && listening);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const label = button.querySelector('span:last-child');
    if (label) label.textContent = t(active ? 'ai_voice_stop' : 'ai_voice_start');
  }

  function clearTimers() {
    clearTimeout(restartTimer);
    clearTimeout(fillerTimer);
    restartTimer = null;
    fillerTimer = null;
  }

  function cleanForSpeech(text) {
    return String(text || '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_`#>\[\]{}]/g, '')
      .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function chooseVoice(lang) {
    if (!speechOutput) return null;
    const wanted = lang === 'ar' ? 'ar' : 'en';
    return speechOutput.getVoices().find(voice => voice.lang.toLowerCase().startsWith(wanted)) || null;
  }

  function speak(text, lang = currentLang) {
    const spokenText = cleanForSpeech(text);
    if (!speechOutput || !window.SpeechSynthesisUtterance || !spokenText) return Promise.resolve();
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
      utterance.rate = lang === 'ar' ? 1.08 : 1.12;
      utterance.pitch = 1;
      const voice = chooseVoice(lang);
      if (voice) utterance.voice = voice;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      speechOutput.speak(utterance);
      setTimeout(finish, Math.max(5000, spokenText.length * 95));
    });
  }

  function stopRecognition() {
    if (!recognition) return;
    recognition.onend = null;
    recognition.onerror = null;
    try { recognition.abort(); } catch (_) { /* انتهت أصلًا */ }
    recognition = null;
  }

  function stopVoiceConversation({ keepStatus = false } = {}) {
    const previousMode = activeMode;
    activeMode = null;
    replyPending = false;
    clearTimers();
    stopRecognition();
    if (speechOutput) speechOutput.cancel();
    Object.keys(configs).forEach(mode => setButton(mode, false));
    if (previousMode && !keepStatus) getStatus(previousMode)?.classList.add('hidden');
  }

  function scheduleListening(mode, delay = 260) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      if (activeMode === mode && !replyPending) startListening(mode);
    }, delay);
  }

  function startListening(mode) {
    if (!SpeechRecognitionApi || activeMode !== mode || replyPending || recognition) return;
    const instance = new SpeechRecognitionApi();
    recognition = instance;
    instance.lang = currentLang === 'ar' ? 'ar-SA' : 'en-US';
    instance.continuous = false;
    instance.interimResults = true;
    instance.maxAlternatives = 1;

    instance.onstart = () => {
      if (activeMode !== mode) return;
      setButton(mode, true, true);
      setStatus(mode, t('ai_voice_listening'));
    };
    instance.onresult = event => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      }
      finalTranscript = finalTranscript.trim();
      if (!finalTranscript || replyPending) return;
      replyPending = true;
      setButton(mode, true, false);
      try { instance.stop(); } catch (_) { /* انتهت أصلًا */ }
      handleVoiceQuestion(mode, finalTranscript);
    };
    instance.onerror = event => {
      if (activeMode !== mode || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        setStatus(mode, t('ai_voice_permission'));
        stopVoiceConversation({ keepStatus: true });
      }
    };
    instance.onend = () => {
      if (recognition === instance) recognition = null;
      if (activeMode === mode && !replyPending) scheduleListening(mode);
    };
    try {
      instance.start();
    } catch (_) {
      recognition = null;
      scheduleListening(mode, 500);
    }
  }

  async function handleVoiceQuestion(mode, transcript) {
    setStatus(mode, t('ai_voice_thinking'), 'thinking');
    const fillers = currentLang === 'ar'
      ? ['ثواني بس.', 'لحظة شوي.', 'انتظرني لحظة، أفكر في جوابك.']
      : ['One moment.', 'Just a second.', 'Give me a moment to think.'];
    fillerTimer = setTimeout(() => {
      if (activeMode !== mode || !replyPending) return;
      if (speechOutput) speechOutput.cancel();
      speak(fillers[Math.floor(Math.random() * fillers.length)]);
    }, 1700);

    const reply = await getConfig(mode).send(transcript);
    clearTimeout(fillerTimer);
    fillerTimer = null;
    if (activeMode !== mode) return;
    if (speechOutput) speechOutput.cancel();
    if (!reply) {
      replyPending = false;
      scheduleListening(mode, 500);
      return;
    }

    setStatus(mode, t('ai_voice_speaking'), 'speaking');
    await speak(reply);
    if (activeMode !== mode) return;
    replyPending = false;
    scheduleListening(mode, 220);
  }

  function toggleVoiceConversation(mode) {
    if (!SpeechRecognitionApi || !speechOutput) {
      setStatus(mode, t('ai_voice_unsupported'));
      return;
    }
    if (activeMode === mode) {
      stopVoiceConversation();
      return;
    }
    stopVoiceConversation();
    activeMode = mode;
    setButton(mode, true);
    setStatus(mode, t('ai_voice_listening'));
    startListening(mode);
  }

  Object.entries(configs).forEach(([mode, config]) => {
    document.getElementById(config.buttonId)?.addEventListener('click', () => toggleVoiceConversation(mode));
  });

  // لا نخلي المايك أو الصوت شغال إذا غادر المستخدم شاشة المحادثة.
  const visibilityObserver = new MutationObserver(() => {
    if (!activeMode) return;
    const section = document.getElementById(getConfig(activeMode).sectionId);
    if (!section || section.classList.contains('hidden')) stopVoiceConversation();
  });
  Object.values(configs).forEach(config => {
    const section = document.getElementById(config.sectionId);
    if (section) visibilityObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && activeMode) stopVoiceConversation();
  });
})();
