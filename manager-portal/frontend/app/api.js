/**
 * api.js — Thin fetch() wrapper for the Manager Portal FastAPI backend.
 * All methods are static async. Non-2xx responses throw an Error with
 * the server's detail/message text included.
 *
 * FastAPI serves the frontend at the same origin, so all paths are relative.
 */

const BASE = '/api';

class API {
  // ─────────────────────────────────────────────────────────────────────────
  // Internal request helper
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method
   * @param {string} path   — path relative to BASE, e.g. '/team/members'
   * @param {object|null}  body   — request body (JSON-serialised)
   * @param {object|null}  params — query-string key/value pairs
   * @returns {Promise<any>} parsed JSON response
   */
  static async _request(method, path, body = null, params = null) {
    // Build URL with query params
    let url = `${BASE}${path}`;
    if (params && typeof params === 'object') {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }

    // Build fetch options
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body !== null && body !== undefined) {
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      throw new Error(`Network error: ${networkErr.message}`);
    }

    // Parse response body (may or may not be JSON)
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch {
        data = null;
      }
    } else {
      // Non-JSON body (e.g. 204 No Content)
      data = null;
    }

    if (!response.ok) {
      // Extract server-provided error message
      let message = `HTTP ${response.status}`;
      if (data) {
        if (typeof data.detail === 'string') {
          message = data.detail;
        } else if (typeof data.detail === 'object') {
          // FastAPI validation errors return detail as an array
          message = JSON.stringify(data.detail);
        } else if (typeof data.message === 'string') {
          message = data.message;
        } else if (typeof data.error === 'string') {
          message = data.error;
        }
      }
      throw new Error(message);
    }

    return data;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Meta
  // ─────────────────────────────────────────────────────────────────────────

  /** Check backend health */
  static async health() {
    return API._request('GET', '/health');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Team — Members
  // ─────────────────────────────────────────────────────────────────────────

  /** List all team members */
  static async getMembers() {
    return API._request('GET', '/team/members');
  }

  /**
   * Create a new team member
   * @param {object} data
   */
  static async createMember(data) {
    return API._request('POST', '/team/members', data);
  }

  /**
   * Update an existing team member
   * @param {string|number} id
   * @param {object} data
   */
  static async updateMember(id, data) {
    return API._request('PUT', `/team/members/${id}`, data);
  }

  /**
   * Delete a team member
   * @param {string|number} id
   */
  static async deleteMember(id) {
    return API._request('DELETE', `/team/members/${id}`);
  }

  /**
   * Get a single team member by ID
   * @param {string|number} id
   */
  static async getMember(id) {
    return API._request('GET', `/team/members/${id}`);
  }

  /**
   * Get all 1-on-1 records for a member
   * @param {string|number} id
   */
  static async getMemberOneOnOnes(id) {
    return API._request('GET', `/team/members/${id}/one_on_ones`);
  }

  /**
   * Get achievements for a member
   * @param {string|number} id
   */
  static async getMemberAchievements(id) {
    return API._request('GET', `/team/members/${id}/achievements`);
  }

  /**
   * Get wellbeing records for a member
   * @param {string|number} id
   */
  static async getMemberWellbeing(id) {
    return API._request('GET', `/team/members/${id}/wellbeing`);
  }

  /**
   * Get feedback records for a member
   * @param {string|number} id
   */
  static async getMemberFeedback(id) {
    return API._request('GET', `/team/members/${id}/feedback`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Team — 1-on-1s
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new 1-on-1 record
   * @param {object} data
   */
  static async createOneOnOne(data) {
    return API._request('POST', '/team/one_on_ones', data);
  }

  /**
   * Update an existing 1-on-1 record
   * @param {string|number} id
   * @param {object} data
   */
  static async updateOneOnOne(id, data) {
    return API._request('PUT', `/team/one_on_ones/${id}`, data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Team — Achievements
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new achievement record
   * @param {object} data
   */
  static async createAchievement(data) {
    return API._request('POST', '/team/achievements', data);
  }

  /**
   * Delete an achievement record
   * @param {string|number} id
   */
  static async deleteAchievement(id) {
    return API._request('DELETE', `/team/achievements/${id}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Team — Feedback
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new feedback record
   * @param {object} data
   */
  static async createFeedback(data) {
    return API._request('POST', '/team/feedback', data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Projects
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List projects, optionally filtered
   * @param {{ status?: string }} [params]
   */
  static async getProjects(params = {}) {
    return API._request('GET', '/projects', null, params);
  }

  /**
   * Create a new project
   * @param {object} data
   */
  static async createProject(data) {
    return API._request('POST', '/projects', data);
  }

  /**
   * Get a single project by ID
   * @param {string|number} id
   */
  static async getProject(id) {
    return API._request('GET', `/projects/${id}`);
  }

  /**
   * Update a project
   * @param {string|number} id
   * @param {object} data
   */
  static async updateProject(id, data) {
    return API._request('PUT', `/projects/${id}`, data);
  }

  /**
   * Delete a project
   * @param {string|number} id
   */
  static async deleteProject(id) {
    return API._request('DELETE', `/projects/${id}`);
  }

  /**
   * Add a status update to a project
   * @param {string|number} id
   * @param {object} data
   */
  static async addProjectUpdate(id, data) {
    return API._request('POST', `/projects/${id}/updates`, data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List action items with optional filters
   * @param {{ status?: string, source?: string, member_id?: string|number, overdue?: boolean }} [params]
   */
  static async getActions(params = {}) {
    return API._request('GET', '/actions', null, params);
  }

  /**
   * Create a new action item
   * @param {object} data
   */
  static async createAction(data) {
    return API._request('POST', '/actions', data);
  }

  /**
   * Update an action item
   * @param {string|number} id
   * @param {object} data
   */
  static async updateAction(id, data) {
    return API._request('PUT', `/actions/${id}`, data);
  }

  /**
   * Mark an action item as complete
   * @param {string|number} id
   */
  static async completeAction(id) {
    return API._request('POST', `/actions/${id}/complete`);
  }

  /**
   * Delete an action item
   * @param {string|number} id
   */
  static async deleteAction(id) {
    return API._request('DELETE', `/actions/${id}`);
  }

  /** Get aggregated action item counts (by status, source, etc.) */
  static async getActionCounts() {
    return API._request('GET', '/actions/count');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Transcripts
  // ─────────────────────────────────────────────────────────────────────────

  /** List all meeting transcripts */
  static async getTranscripts() {
    return API._request('GET', '/transcripts');
  }

  /**
   * Get a single transcript by ID
   * @param {string|number} id
   */
  static async getTranscript(id) {
    return API._request('GET', `/transcripts/${id}`);
  }

  /** Trigger a Zoom transcript sync */
  static async syncZoom() {
    return API._request('POST', '/transcripts/sync/zoom');
  }

  /**
   * Full-text search across transcripts
   * @param {string} q — search query
   */
  static async searchTranscripts(q) {
    return API._request('GET', '/transcripts/search', null, { q });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Inbox
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List inbox items filtered by status
   * @param {'pending'|'approved'|'dismissed'} [status='pending']
   */
  static async getInbox(status = 'pending') {
    return API._request('GET', '/inbox', null, { status });
  }

  /** Get unread/pending inbox item counts */
  static async getInboxCount() {
    return API._request('GET', '/inbox/count');
  }

  /**
   * Approve a single inbox item, creating the underlying record
   * @param {string|number} id          — inbox item ID
   * @param {string}        itemType    — e.g. 'achievement', 'feedback', 'action'
   * @param {object}        itemData    — the data to save for the approved item
   */
  static async approveInboxItem(id, itemType, itemData) {
    return API._request('POST', `/inbox/${id}/approve`, { item_type: itemType, item_data: itemData });
  }

  /**
   * Approve ALL pending items inside an inbox batch/group
   * @param {string|number} id — inbox item / batch ID
   */
  static async approveAllInboxItems(id) {
    return API._request('POST', `/inbox/${id}/approve_all`);
  }

  /**
   * Dismiss (soft-delete) an inbox item
   * @param {string|number} id
   */
  static async dismissInboxItem(id) {
    return API._request('POST', `/inbox/${id}/dismiss`);
  }

  /**
   * Update metadata / edited fields on an inbox item
   * @param {string|number} id
   * @param {object} data
   */
  static async updateInboxItem(id, data) {
    return API._request('PUT', `/inbox/${id}`, data);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sync
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Trigger a data sync for the given source
   * @param {'zoom'|'gmail'|'slack'} source
   */
  static async syncSource(source) {
    return API._request('POST', `/sync/${source}`);
  }
}

export default API;
