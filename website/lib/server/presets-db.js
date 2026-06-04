const { dbQuery } = require('./db');

class PresetError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

class PresetNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

async function createPreset(userId, { username, title, intent, duration, stats }) {
  if (!userId || !username || !title || duration === undefined) {
    throw new PresetError('userId, username, title, and duration are required.');
  }

  try {
    const result = await dbQuery(
      `INSERT INTO presets (user_id, username, title, intent, duration, stats)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING preset_id, user_id, username, title, intent, duration, stats, created_at`,
      [userId, username, title, intent || null, duration, stats || null]
    );

    return result.rows[0];
  } catch (error) {
    const pgCode = error.code;
    if (pgCode === '23505') {
      throw new PresetError('You already have a preset with this name.');
    }

    throw error;
  }
}

async function getPresetsByUser(userId) {
  if (!userId) {
    throw new PresetError('userId is required.');
  }

  const result = await dbQuery(
    `SELECT preset_id, user_id, username, title, intent, duration, stats, created_at
     FROM presets
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows;
}

async function getPresetById(presetId, userId) {
  if (!presetId || !userId) {
    throw new PresetError('presetId and userId are required.');
  }

  const result = await dbQuery(
    `SELECT preset_id, user_id, username, title, intent, duration, stats, created_at
     FROM presets
     WHERE preset_id = $1 AND user_id = $2`,
    [presetId, userId]
  );

  const preset = result.rows[0];
  if (!preset) {
    throw new PresetNotFoundError('Preset not found.');
  }

  return preset;
}

async function updatePreset(presetId, userId, updates) {
  if (!presetId || !userId) {
    throw new PresetError('presetId and userId are required.');
  }

  const allowed = ['title', 'intent', 'duration', 'stats'];
  const fields = Object.keys(updates).filter(key => allowed.includes(key));

  if (fields.length === 0) {
    throw new PresetError('No valid fields to update.');
  }

  const setClauses = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
  const values = [...fields.map(field => updates[field]), presetId, userId];

  try {
    const result = await dbQuery(
      `UPDATE presets
       SET ${setClauses}
       WHERE preset_id = $${fields.length + 1} AND user_id = $${fields.length + 2}
       RETURNING preset_id, user_id, username, title, intent, duration, stats, created_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new PresetNotFoundError('Preset not found.');
    }

    return result.rows[0];
  } catch (error) {
    if (error instanceof PresetNotFoundError) throw error;
    const pgCode = error.code;
    if (pgCode === '23505') {
      throw new PresetError('You already have a preset with this name.');
    }

    throw error;
  }
}

async function deletePreset(presetId, userId) {
  if (!presetId || !userId) {
    throw new PresetError('presetId and userId are required.');
  }

  const result = await dbQuery(
    `DELETE FROM presets
     WHERE preset_id = $1 AND user_id = $2
     RETURNING preset_id`,
    [presetId, userId]
  );

  if (result.rows.length === 0) {
    throw new PresetNotFoundError('Preset not found.');
  }

  return { success: true };
}

module.exports = {
  PresetError,
  PresetNotFoundError,
  createPreset,
  getPresetsByUser,
  getPresetById,
  updatePreset,
  deletePreset,
};
