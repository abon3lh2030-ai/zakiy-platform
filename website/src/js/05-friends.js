// ---------- الأصدقاء ----------
async function loadFriends() {
  try {
    const res = await fetch(`${API_BASE}/api/friends`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    renderFriendsList(data.friends || []);
  } catch { /* تجاهل */ }

  try {
    const res = await fetch(`${API_BASE}/api/friends/requests`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    renderFriendRequests(data.incoming || []);
  } catch { /* تجاهل */ }

  loadSessionInvites();
}

// ---------- دعوات الجلسات (يدعوك صديق تنضم لغرفة/كلاس عنده) ----------
async function loadSessionInvites() {
  try {
    const res = await fetch(`${API_BASE}/api/friends/invites`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    renderSessionInvites(data.invites || []);
  } catch { /* تجاهل */ }
}

function renderSessionInvites(invites) {
  const container = document.getElementById('sessionInvitesList');
  if (!invites.length) {
    container.innerHTML = `<p class="desc">${t('session_invites_empty')}</p>`;
    return;
  }
  container.innerHTML = invites.map(inv => {
    const typeLabel = inv.room_type === 'classroom' ? t('invite_to_room_type_classroom') : t('invite_to_room_type_quiz');
    return `
      <div class="friend-request-row">
        <span class="name">${t('invite_from_prefix')} ${inv.from_username || '?'} — ${typeLabel}</span>
        <div style="display:flex; gap:6px;">
          <button class="primary join-invite-btn" data-code="${inv.room_code}" data-id="${inv.id}" style="padding:5px 12px; font-size:12px;">${t('btn_join_now')}</button>
          <button class="ghost dismiss-invite-btn" data-id="${inv.id}" style="padding:5px 12px; font-size:12px;">${t('btn_dismiss_invite')}</button>
        </div>
      </div>
    `;
  }).join('');
  container.querySelectorAll('.join-invite-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      fetch(`${API_BASE}/api/friends/invites/${btn.dataset.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAccessToken}` },
      }).catch(() => {});
      goToJoinRoomWithCode(btn.dataset.code);
    });
  });
  container.querySelectorAll('.dismiss-invite-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`${API_BASE}/api/friends/invites/${btn.dataset.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAccessToken}` },
      }).catch(() => {});
      loadSessionInvites();
    });
  });
}

// ---------- دعوة صديق لجلستك الحالية ----------
async function openInviteFriendModal() {
  clearError('inviteFriendList');
  document.getElementById('inviteFriendList').innerHTML = '';
  hide('inviteFriendEmpty');
  show('inviteFriendModal');
  try {
    const res = await fetch(`${API_BASE}/api/friends`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    const friends = data.friends || [];
    if (!friends.length) {
      show('inviteFriendEmpty');
      return;
    }
    document.getElementById('inviteFriendList').innerHTML = friends.map(f => `
      <div class="friend-row">
        <span class="name">${f.username}</span>
        <button class="primary send-invite-btn" data-id="${f.user_id}" style="padding:5px 12px; font-size:12px;">${t('btn_invite_friend')}</button>
      </div>
    `).join('');
    document.getElementById('inviteFriendList').querySelectorAll('.send-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await fetch(`${API_BASE}/api/friends/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
            body: JSON.stringify({ to_user_id: btn.dataset.id, room_code: currentRoomCode, room_type: roomKind }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          btn.textContent = t('invite_sent');
        } catch (err) {
          btn.disabled = false;
          alert(err.message || t('err_invite_failed'));
        }
      });
    });
  } catch {
    show('inviteFriendEmpty');
  }
}
document.getElementById('inviteFriendBtn').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  openInviteFriendModal();
});
document.getElementById('inviteFriendBtnClassroom').addEventListener('click', () => {
  if (!requireAuthOrPrompt()) return;
  openInviteFriendModal();
});
document.getElementById('inviteFriendModalCloseBtn').addEventListener('click', () => hide('inviteFriendModal'));

function renderFriendsList(friends) {
  const container = document.getElementById('friendsList');
  if (!friends.length) {
    container.innerHTML = `<p class="desc">${t('friends_list_empty')}</p>`;
    return;
  }
  container.innerHTML = friends.map(f => `
    <div class="friend-row">
      <span class="name view-profile-link" data-id="${f.user_id}" style="cursor:pointer; text-decoration:underline;">${f.username}</span>
      <button class="ghost remove-friend-btn" data-id="${f.user_id}" style="padding:5px 10px; font-size:12px;">🗑️ ${t('btn_remove')}</button>
    </div>
  `).join('');
  container.querySelectorAll('.remove-friend-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(t('confirm_remove_friend'))) return;
      await fetch(`${API_BASE}/api/friends/${btn.dataset.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentAccessToken}` },
      }).catch(() => {});
      loadFriends();
    });
  });
  wireViewProfileLinks(container);
}

// روابط "شوف البروفايل" تتكرر بأكثر من مكان (قائمة الأصدقاء، نتائج البحث) -
// دالة وحدة نوصلها بأي حاوية فيها عناصر .view-profile-link
function wireViewProfileLinks(container) {
  container.querySelectorAll('.view-profile-link').forEach(el => {
    el.addEventListener('click', () => showProfileScreen(el.dataset.id));
  });
}

function renderFriendRequests(incoming) {
  const container = document.getElementById('friendRequestsList');
  if (!incoming.length) {
    container.innerHTML = `<p class="desc">${t('friend_requests_empty')}</p>`;
    return;
  }
  container.innerHTML = incoming.map(r => `
    <div class="friend-request-row">
      <span class="name">${r.username}</span>
      <div style="display:flex; gap:6px;">
        <button class="primary accept-friend-btn" data-id="${r.id}" style="padding:5px 12px; font-size:12px;">✅ ${t('btn_accept')}</button>
        <button class="ghost reject-friend-btn" data-id="${r.id}" style="padding:5px 12px; font-size:12px;">❌ ${t('btn_reject')}</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('.accept-friend-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`${API_BASE}/api/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
        body: JSON.stringify({ request_id: parseInt(btn.dataset.id, 10) }),
      }).catch(() => {});
      loadFriends();
    });
  });
  container.querySelectorAll('.reject-friend-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch(`${API_BASE}/api/friends/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
        body: JSON.stringify({ request_id: parseInt(btn.dataset.id, 10) }),
      }).catch(() => {});
      loadFriends();
    });
  });
}

document.getElementById('friendSearchBtn').addEventListener('click', async () => {
  const q = document.getElementById('friendSearchInput').value.trim();
  const container = document.getElementById('friendSearchResults');
  if (!q) { container.innerHTML = ''; return; }
  try {
    const res = await fetch(`${API_BASE}/api/friends/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Authorization': `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    const results = data.results || [];
    if (!results.length) {
      container.innerHTML = `<p class="desc">${t('friend_search_no_results')}</p>`;
      return;
    }
    container.innerHTML = results.map(u => `
      <div class="friend-row">
        <span class="name view-profile-link" data-id="${u.user_id}" style="cursor:pointer; text-decoration:underline;">${u.username}</span>
        <button class="ghost add-friend-btn" data-id="${u.user_id}" style="padding:5px 10px; font-size:12px;">➕ ${t('btn_add')}</button>
      </div>
    `).join('');
    wireViewProfileLinks(container);
    container.querySelectorAll('.add-friend-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await fetch(`${API_BASE}/api/friends/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentAccessToken}` },
            body: JSON.stringify({ to_user_id: btn.dataset.id }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          btn.textContent = `✅ ${t('friend_request_sent')}`;
        } catch (err) {
          btn.disabled = false;
          alert(err.message || t('err_friend_request_failed'));
        }
      });
    });
  } catch {
    container.innerHTML = `<p class="desc">${t('err_search_failed')}</p>`;
  }
});
document.getElementById('friendSearchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('friendSearchBtn').click();
});

