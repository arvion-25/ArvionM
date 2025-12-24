// admin-script.js - Multi-user display management

function toIST(utcIso) {
  if (!utcIso) return '';
  const d = new Date(utcIso);
  return d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(',', '');
}

let displayUsers = [];

// ---------- Load Display Users ----------
async function loadDisplayUsers() {
  try {
    const { data, error } = await supabase.rpc('get_display_users');
    if (error) {
      console.error('Load users error:', error);
      return [];
    }
    displayUsers = data || [];
    return displayUsers;
  } catch (e) {
    console.error('Unexpected error loading users:', e);
    return [];
  }
}

// ---------- Populate Dropdowns ----------
async function populateUserDropdowns() {
  const users = await loadDisplayUsers();
  
  // Populate target user dropdown for upload
  const targetUser = document.getElementById('targetUser');
  targetUser.innerHTML = '<option value="">Select Display User</option>';
  users.forEach(u => {
    targetUser.innerHTML += `<option value="${u.username}">${u.username}</option>`;
  });

  // Populate video filter dropdown
  const videoFilter = document.getElementById('videoFilterUser');
  videoFilter.innerHTML = '<option value="">All Users</option>';
  users.forEach(u => {
    videoFilter.innerHTML += `<option value="${u.username}">${u.username}</option>`;
  });

  // Populate history user filter dropdown
  const historyFilter = document.getElementById('historyUserFilter');
  historyFilter.innerHTML = '<option value="">All Users</option>';
  users.forEach(u => {
    historyFilter.innerHTML += `<option value="${u.username}">${u.username}</option>`;
  });

  // Populate export user select dropdown (single shared dropdown)
  const exportUserSelect = document.getElementById('exportUserSelect');
  if (exportUserSelect) {
    exportUserSelect.innerHTML = '<option value="">All Users</option>';
    users.forEach(u => {
      exportUserSelect.innerHTML += `<option value="${u.username}">${u.username}</option>`;
    });
  }
}

// ---------- Display Users List ----------
async function displayUsersList() {
  const ul = document.getElementById('usersList');
  ul.innerHTML = 'Loading users...';
  
  const users = await loadDisplayUsers();
  
  if (users.length === 0) {
    ul.innerHTML = '<li>No display users created yet</li>';
    return;
  }
  
  ul.innerHTML = '';
  users.forEach(user => {
    const li = document.createElement('li');
    const createdDate = new Date(user.created_at).toLocaleDateString();
    li.innerHTML = `
      <div>
        <strong>${user.username}</strong>
        <span class="badge">Created: ${createdDate}</span>
      </div>
      <button class="delete-btn" data-username="${user.username}">Delete</button>
    `;
    
    li.querySelector('.delete-btn').onclick = async () => {
      if (!confirm(`Delete user "${user.username}" and all their videos?\n\nThis action cannot be undone.`)) {
        return;
      }
      
      try {
        // Delete user from database
        const { data, error } = await supabase.rpc('delete_display_user', { un: user.username });
        
        if (error) {
          alert('Failed to delete user: ' + error.message);
          console.error(error);
          return;
        }
        
        if (!data) {
          alert('Failed to delete user. User may be admin or not found.');
          return;
        }
        
        // Delete all videos from storage for this user
        const { data: videos } = await supabase.from('videos').select('storage_path').eq('display_user', user.username);
        if (videos && videos.length > 0) {
          const paths = videos.map(v => v.storage_path);
          await supabase.storage.from('ads-videos').remove(paths);
        }
        
        alert('User deleted successfully!');
        await displayUsersList();
        await populateUserDropdowns();
        await listVideos();
      } catch (e) {
        console.error('Unexpected error deleting user:', e);
        alert('Failed to delete user. Please try again.');
      }
    };
    
    ul.appendChild(li);
  });
}

// ---------- Create Display User ----------
document.getElementById('createUserForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  
  if (!username || !password) {
    alert('Please enter both username and password');
    return;
  }
  
  // Validate username format
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    alert('Username can only contain letters, numbers, underscore, and hyphen');
    return;
  }
  
  if (username === 'admin') {
    alert('Cannot create user with username "admin"');
    return;
  }
  
  try {
    const { data, error } = await supabase.rpc('create_display_user', { 
      un: username, 
      pwd: password 
    });
    
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        alert('Username already exists. Please choose a different username.');
      } else {
        alert('Failed to create user: ' + error.message);
      }
      console.error(error);
      return;
    }
    
    alert(`User "${username}" created successfully!`);
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    
    await displayUsersList();
    await populateUserDropdowns();
  } catch (e) {
    console.error('Unexpected error creating user:', e);
    alert('Failed to create user. Please try again.');
  }
});

// ---------- Videos Management ----------
async function listVideos(filterUser = null) {
  const ul = document.getElementById('videoList');
  ul.innerHTML = 'Loading videos...';
  
  try {
    // Get videos from database with display_user info
    let query = supabase.from('videos').select('*').order('uploaded_at', { ascending: false });
    
    if (filterUser) {
      query = query.eq('display_user', filterUser);
    }
    
    const { data: videoRecords, error: dbError } = await query;
    
    if (dbError) {
      console.error('Error loading videos:', dbError);
      ul.innerHTML = '<li>Error loading videos</li>';
      return;
    }
    
    if (!videoRecords || videoRecords.length === 0) {
      ul.innerHTML = '<li>No videos uploaded yet</li>';
      return;
    }
    
    ul.innerHTML = '';
    videoRecords.forEach(video => {
      const li = document.createElement('li');
      const uploadDate = new Date(video.uploaded_at).toLocaleDateString();
      li.innerHTML = `
        <div>
          <strong>${video.filename}</strong>
          <span class="badge">User: ${video.display_user}</span>
          <span class="badge">Uploaded: ${uploadDate}</span>
        </div>
        <button class="delete-btn" data-path="${video.storage_path}" data-id="${video.id}">Delete</button>
      `;
      
      li.querySelector('.delete-btn').onclick = async () => {
        if (!confirm('Delete this video?')) return;
        
        try {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('ads-videos')
            .remove([video.storage_path]);
          
          if (storageError) {
            console.error('Storage delete error:', storageError);
          }
          
          // Delete from database
          await supabase.from('videos').delete().eq('id', video.id);
          
          alert('Video deleted successfully!');
          await listVideos(document.getElementById('videoFilterUser').value || null);
        } catch (e) {
          console.error('Unexpected error deleting video:', e);
          alert('Failed to delete video. Please try again.');
        }
      };
      
      ul.appendChild(li);
    });
  } catch (e) {
    console.error('Unexpected error listing videos:', e);
    ul.innerHTML = '<li>Error loading videos</li>';
  }
}

// ---------- Upload Video ----------
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const targetUser = document.getElementById('targetUser').value;
  const file = e.target.video.files[0];
  
  if (!targetUser) {
    alert('Please select a display user');
    return;
  }
  
  if (!file) {
    alert('Please select a video file');
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';
  
  try {
    const fileName = `${targetUser}/${Date.now()}-${file.name}`;
    
    const { error: uploadError } = await supabase.storage
      .from('ads-videos')
      .upload(fileName, file);
    
    if (uploadError) {
      alert('Upload failed: ' + uploadError.message);
      console.error(uploadError);
      return;
    }
    
    // Record in database
    await supabase.from('videos').insert([{
      filename: file.name,
      storage_path: fileName,
      uploaded_by: sessionStorage.getItem('logged_user') || 'admin',
      display_user: targetUser
    }]);
    
    alert('Video uploaded successfully!');
    e.target.video.value = '';
    document.getElementById('targetUser').value = '';
    await listVideos();
  } catch (e) {
    console.error('Unexpected upload error:', e);
    alert('Upload failed. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Upload';
  }
});

// ---------- Filter Videos by User ----------
document.getElementById('filterVideosBtn').onclick = () => {
  const filterUser = document.getElementById('videoFilterUser').value;
  listVideos(filterUser || null);
};

// ---------- Login History Management ----------
async function loadHistory(filterDate = null, filterUser = null) {
  const tbody = document.getElementById('historyBody');
  if (!tbody) return;
  
  const previousHTML = tbody.innerHTML;
  tbody.innerHTML = '<tr><td colspan="5">Loading history...</td></tr>';
  
  try {
    let query = supabase.from('login_history')
      .select('*')
      .neq('user_name', 'admin')
      .order('login_time', { ascending: false });
    
    if (filterUser) {
      query = query.eq('user_name', filterUser);
    }
    
    if (filterDate) {
      const start = new Date(filterDate + 'T00:00:00Z').toISOString();
      const end = new Date(filterDate + 'T23:59:59Z').toISOString();
      query = query.gte('login_time', start).lte('login_time', end);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Load history error:', error);
      tbody.innerHTML = previousHTML || '<tr><td colspan="5">Error loading history</td></tr>';
      return;
    }
    
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No records found</td></tr>';
      return;
    }
    
    tbody.innerHTML = '';
    data.forEach(r => {
      let logoutDisplay = r.logout_time ? toIST(r.logout_time) : 'Active';
      if (!r.logout_time && r.last_ping) {
        const lastPing = new Date(r.last_ping);
        const ageSec = (Date.now() - lastPing.getTime()) / 1000;
        if (ageSec > 70) logoutDisplay = toIST(r.last_ping) + ' (detected offline)';
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.user_name}</td>
        <td>${toIST(r.login_time)}</td>
        <td>${logoutDisplay}</td>
        <td>${r.device_model || ''}</td>
        <td class="user-agent" title="${r.user_agent || ''}">${r.user_agent || ''}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    console.error('Unexpected error loading history:', e);
    tbody.innerHTML = previousHTML || '<tr><td colspan="5">Error loading history</td></tr>';
  }
}

// ---------- Export Functions ----------
function csvFromRows(rows) {
  let out = 'Username,Login (IST),Logout (IST),Device,User-Agent\n';
  rows.forEach(r => {
    const logout = r.logout_time ? toIST(r.logout_time) : (r.last_ping ? toIST(r.last_ping) + ' (detected offline)' : '');
    out += `"${r.user_name}","${toIST(r.login_time)}","${logout}","${r.device_model || ''}","${(r.user_agent || '').replace(/"/g, '""')}"\n`;
  });
  return out;
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Export All History
document.getElementById('exportAllBtn').onclick = async () => {
  const btn = document.getElementById('exportAllBtn');
  const user = document.getElementById('exportUserSelect').value;
  
  btn.disabled = true;
  btn.textContent = 'Exporting...';
  
  try {
    let query = supabase.from('login_history')
      .select('*')
      .neq('user_name', 'admin')
      .order('login_time', { ascending: false });
    
    if (user) {
      query = query.eq('user_name', user);
    }
    
    const { data, error } = await query;
    
    if (error) {
      alert('Export failed');
      console.error(error);
      return;
    }
    
    if (!data || data.length === 0) {
      alert('No records found' + (user ? ' for selected user' : ''));
      return;
    }
    
    const filename = user ? `history-${user}-all.csv` : 'history-all.csv';
    const csv = csvFromRows(data);
    downloadCSV(csv, filename);
    alert(`Exported ${data.length} records successfully!`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export All History';
  }
};

// Export Selected Date
document.getElementById('exportSelectedBtn').onclick = async () => {
  const btn = document.getElementById('exportSelectedBtn');
  const date = document.getElementById('exportSingleDate').value;
  const user = document.getElementById('exportUserSelect').value;
  
  if (!date) {
    alert('Please select a date');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Exporting...';
  
  try {
    let query = supabase.from('login_history')
      .select('*')
      .neq('user_name', 'admin')
      .order('login_time', { ascending: false });
    
    if (user) {
      query = query.eq('user_name', user);
    }
    
    const start = new Date(date + 'T00:00:00Z').toISOString();
    const end = new Date(date + 'T23:59:59Z').toISOString();
    query = query.gte('login_time', start).lte('login_time', end);
    
    const { data, error } = await query;
    
    if (error) {
      alert('Export failed');
      console.error(error);
      return;
    }
    
    if (!data || data.length === 0) {
      alert('No records found for selected date' + (user ? ' and user' : ''));
      return;
    }
    
    const filename = user ? `history-${user}-${date}.csv` : `history-${date}.csv`;
    const csv = csvFromRows(data);
    downloadCSV(csv, filename);
    alert(`Exported ${data.length} records successfully!`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export Selected Date';
  }
};

// Export Date Range
document.getElementById('exportRangeBtn').onclick = async () => {
  const btn = document.getElementById('exportRangeBtn');
  const startDate = document.getElementById('exportStartDate').value;
  const endDate = document.getElementById('exportEndDate').value;
  const user = document.getElementById('exportUserSelect').value;
  
  if (!startDate || !endDate) {
    alert('Please select both start and end dates');
    return;
  }
  
  if (new Date(startDate) > new Date(endDate)) {
    alert('Start date must be before or equal to end date');
    return;
  }
  
  btn.disabled = true;
  btn.textContent = 'Exporting...';
  
  try {
    const start = new Date(startDate + 'T00:00:00Z').toISOString();
    const end = new Date(endDate + 'T23:59:59Z').toISOString();
    
    let query = supabase.from('login_history')
      .select('*')
      .neq('user_name', 'admin')
      .gte('login_time', start)
      .lte('login_time', end)
      .order('login_time', { ascending: false });
    
    if (user) {
      query = query.eq('user_name', user);
    }
    
    const { data, error } = await query;
    
    if (error) {
      alert('Export failed');
      console.error(error);
      return;
    }
    
    if (!data || data.length === 0) {
      alert('No records found for selected date range' + (user ? ' and user' : ''));
      return;
    }
    
    const filename = user 
      ? `history-${user}-${startDate}-to-${endDate}.csv`
      : `history-${startDate}-to-${endDate}.csv`;
    const csv = csvFromRows(data);
    downloadCSV(csv, filename);
    
    alert(`Exported ${data.length} records successfully!`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export Date Range';
  }
};

// ---------- Filter Buttons ----------
document.getElementById('filterBtn').onclick = () => {
  const date = document.getElementById('filterDate').value;
  const user = document.getElementById('historyUserFilter').value;
  loadHistory(date || null, user || null);
};

document.getElementById('refreshBtn').onclick = () => {
  document.getElementById('filterDate').value = '';
  document.getElementById('historyUserFilter').value = '';
  loadHistory();
};

// ---------- Realtime Updates ----------
let refreshScheduled = false;
function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  setTimeout(() => {
    const date = document.getElementById('filterDate')?.value;
    const user = document.getElementById('historyUserFilter')?.value;
    loadHistory(date || null, user || null);
    listVideos(document.getElementById('videoFilterUser')?.value || null);
    refreshScheduled = false;
  }, 600);
}

let channel = null;
async function ensureChannelSubscribed() {
  if (channel) return;
  channel = supabase.channel('login_updates');

  channel.on('broadcast', { event: '*' }, (payload) => {
    console.log('[broadcast] event=', payload.event);
    scheduleRefresh();
  });

  try {
    await channel.subscribe();
    console.log('channel subscribed to login_updates');
    const date = document.getElementById('filterDate')?.value;
    const user = document.getElementById('historyUserFilter')?.value;
    loadHistory(date || null, user || null);
    listVideos();
  } catch (err) {
    console.warn('channel subscribe failed', err);
  }
}

ensureChannelSubscribed().catch(e => console.warn('subscribe error', e));

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    ensureChannelSubscribed().catch(() => {});
    setTimeout(() => {
      const date = document.getElementById('filterDate')?.value;
      const user = document.getElementById('historyUserFilter')?.value;
      loadHistory(date || null, user || null);
      listVideos(document.getElementById('videoFilterUser')?.value || null);
    }, 300);
  }
});

// ---------- Initial Load ----------
(async function() {
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' });
  const [d, m, y] = now.split(',')[0].split('/');
  const todayIST = `${y}-${m}-${d}`;

  document.getElementById('filterDate').value = todayIST;
  
  await populateUserDropdowns();
  await displayUsersList();
  listVideos();
  loadHistory(todayIST);
})();
