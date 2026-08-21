// ---------- الصوت الجماعي (WebRTC، صوت مباشر بين المتصفحات) ----------
// السيرفر ما يمر عليه أي صوت - يسوي بس "إشارة" (signaling): تبادل عروض SDP
// ومرشحات ICE بين المتصفحات عشان تكوّن اتصال مباشر مع بعض. يشتغل بنمط mesh
// (كل مشارك يتصل مباشرة بكل مشارك ثاني بالصوت) - مناسب لعدد صغير كغرفة مذاكرة.
// يعتمد على سيرفر STUN عام من قوقل (مجاني، بدون تسجيل)، ما فيه TURN، فبعض
// الشبكات المقيدة جدًا (بعض شبكات الشركات/الجامعات) ممكن ما تكمل الاتصال.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
let localVoiceStream = null;
let inVoiceChat = false;
let voiceMuted = false;
const voicePeerConnections = new Map(); // sid -> RTCPeerConnection
const voiceAudioElements = new Map(); // sid -> <audio>

function updateVoiceUI() {
  if (inVoiceChat) {
    hide('voiceJoinBtn'); show('voiceLeaveBtn'); show('voiceMuteBtn');
    document.getElementById('voiceMuteBtn').textContent = t(voiceMuted ? 'btn_voice_unmute' : 'btn_voice_mute');
  } else {
    show('voiceJoinBtn'); hide('voiceLeaveBtn'); hide('voiceMuteBtn');
  }
}

function createVoicePeerConnection(peerSid) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localVoiceStream.getTracks().forEach(track => pc.addTrack(track, localVoiceStream));

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit('voice_ice_candidate', { to_sid: peerSid, candidate: e.candidate });
    }
  };

  pc.ontrack = e => {
    let audioEl = voiceAudioElements.get(peerSid);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      voiceAudioElements.set(peerSid, audioEl);
    }
    audioEl.srcObject = e.streams[0];
  };

  voicePeerConnections.set(peerSid, pc);
  return pc;
}

async function initiateVoiceOfferTo(peerSid) {
  const pc = createVoicePeerConnection(peerSid);
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('voice_offer', { to_sid: peerSid, offer });
}

function cleanupVoicePeer(sid) {
  const pc = voicePeerConnections.get(sid);
  if (pc) { pc.close(); voicePeerConnections.delete(sid); }
  const audioEl = voiceAudioElements.get(sid);
  if (audioEl) { audioEl.remove(); voiceAudioElements.delete(sid); }
}

document.getElementById('voiceJoinBtn').addEventListener('click', async () => {
  clearError('voiceError');
  try {
    localVoiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    showError('voiceError', t('err_mic_access'));
    return;
  }
  inVoiceChat = true;
  voiceMuted = false;
  updateVoiceUI();
  socket.emit('voice_join', { room_code: currentRoomCode });
});

document.getElementById('voiceLeaveBtn').addEventListener('click', () => {
  inVoiceChat = false;
  if (localVoiceStream) {
    localVoiceStream.getTracks().forEach(t => t.stop());
    localVoiceStream = null;
  }
  voicePeerConnections.forEach((_pc, sid) => cleanupVoicePeer(sid));
  updateVoiceUI();
  socket.emit('voice_leave', { room_code: currentRoomCode });
});

document.getElementById('voiceMuteBtn').addEventListener('click', () => {
  if (!localVoiceStream) return;
  voiceMuted = !voiceMuted;
  localVoiceStream.getAudioTracks().forEach(t => t.enabled = !voiceMuted);
  updateVoiceUI();
});

// وقت الاختبار: نكتم المايك إجباريًا بدل ما نطرد المستخدم من الصوت بالكامل -
// يرجع يشغّله بنفسه يدويًا بعد ما يسلّم لو ودّه
function forceMuteVoiceForExam() {
  if (inVoiceChat && localVoiceStream && !voiceMuted) {
    voiceMuted = true;
    localVoiceStream.getAudioTracks().forEach(t => t.enabled = false);
    updateVoiceUI();
  }
}

socket.on('voice_existing_peers', async data => {
  for (const peer of data.peers) {
    await initiateVoiceOfferTo(peer.sid);
  }
});

socket.on('voice_offer', async data => {
  const pc = createVoicePeerConnection(data.from_sid);
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('voice_answer', { to_sid: data.from_sid, answer });
});

socket.on('voice_answer', async data => {
  const pc = voicePeerConnections.get(data.from_sid);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('voice_ice_candidate', async data => {
  const pc = voicePeerConnections.get(data.from_sid);
  if (pc && data.candidate) {
    try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (err) { /* تجاهل */ }
  }
});

socket.on('voice_peer_left', data => cleanupVoicePeer(data.sid));

