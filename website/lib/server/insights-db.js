const { dbQuery } = require('./db');

class InsightError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

class InsightNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.status = 404;
  }
}

async function createInsight(userId, { title, intent, duration, startTime, endTime, completedAt, analytics }) {
  if (!userId || !title || duration === undefined) {
    throw new InsightError('userId, title, and duration are required.');
  }

  try {
    const result = await dbQuery(
      `INSERT INTO "BrainSync".insights (user_id, title, intent, duration, start_time, end_time, completed_at, analytics)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING insight_id, user_id, title, intent, duration, start_time, end_time, completed_at, analytics`,
      [
        userId,
        title,
        intent || null,
        duration,
        startTime ? BigInt(startTime) : null,
        endTime ? BigInt(endTime) : null,
        completedAt || new Date().toISOString(),
        analytics ? JSON.stringify(analytics) : null
      ]
    );

    return result.rows[0];
  } catch (error) {
    throw error;
  }
}

async function getInsightsByUser(userId) {
  if (!userId) {
    throw new InsightError('userId is required.');
  }

  const result = await dbQuery(
    `SELECT insight_id, user_id, title, intent, duration, start_time, end_time, completed_at, analytics
     FROM "BrainSync".insights
     WHERE user_id = $1
     ORDER BY completed_at DESC`,
    [userId]
  );

  return result.rows;
}

module.exports = {
  InsightError,
  InsightNotFoundError,
  createInsight,
  getInsightsByUser
};
