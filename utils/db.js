import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, "..", "db");
const dbPath = path.join(dbDir, "vantrix.sqlite");

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
    CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_actions_lookup ON actions(user_id, guild_id, action_type, timestamp);

    CREATE TABLE IF NOT EXISTS deleted_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        metadata TEXT NOT NULL,
        deleted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deleted_channels ON deleted_channels(guild_id, deleted_at);

    CREATE TABLE IF NOT EXISTS deleted_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        metadata TEXT NOT NULL,
        deleted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_deleted_roles ON deleted_roles(guild_id, deleted_at);

    CREATE TABLE IF NOT EXISTS banned_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        executor_id TEXT NOT NULL,
        banned_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_banned ON banned_users(guild_id, executor_id, banned_at);

    CREATE TABLE IF NOT EXISTS kicked_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        executor_id TEXT NOT NULL,
        kicked_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_kicked ON kicked_users(guild_id, executor_id, kicked_at);

    CREATE TABLE IF NOT EXISTS unbanned_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        executor_id TEXT NOT NULL,
        unbanned_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_unbanned ON unbanned_users(guild_id, executor_id, unbanned_at);

    CREATE TABLE IF NOT EXISTS created_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_created_channels ON created_channels(guild_id, created_at);

    CREATE TABLE IF NOT EXISTS created_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_created_roles ON created_roles(guild_id, created_at);

    CREATE TABLE IF NOT EXISTS original_channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        metadata TEXT NOT NULL,
        saved_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_original_channels ON original_channels(guild_id, saved_at);

    CREATE TABLE IF NOT EXISTS original_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        role_id TEXT NOT NULL UNIQUE,
        metadata TEXT NOT NULL,
        saved_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_original_roles ON original_roles(guild_id, saved_at);

    CREATE TABLE IF NOT EXISTS original_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        member_id TEXT NOT NULL UNIQUE,
        role_ids TEXT NOT NULL,
        saved_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_original_members ON original_members(guild_id, saved_at);

    CREATE TABLE IF NOT EXISTS original_server (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL UNIQUE,
        metadata TEXT NOT NULL,
        saved_at INTEGER NOT NULL
    );
`);

const stmts = {
  insertAction: db.prepare(
    "INSERT INTO actions (user_id, guild_id, action_type, timestamp) VALUES (?, ?, ?, ?)"
  ),
  countActions: db.prepare(
    "SELECT COUNT(*) as count FROM actions WHERE user_id = ? AND guild_id = ? AND action_type = ? AND timestamp > ?"
  ),
  deleteUserActions: db.prepare(
    "DELETE FROM actions WHERE user_id = ? AND guild_id = ? AND action_type = ?"
  ),
  cleanupActions: db.prepare("DELETE FROM actions WHERE timestamp < ?"),

  insertDeletedChannel: db.prepare(
    "INSERT INTO deleted_channels (guild_id, channel_id, metadata, deleted_at) VALUES (?, ?, ?, ?)"
  ),
  getDeletedChannels: db.prepare(
    "SELECT * FROM deleted_channels WHERE guild_id = ? AND deleted_at > ? ORDER BY deleted_at DESC"
  ),
  clearDeletedChannels: db.prepare(
    "DELETE FROM deleted_channels WHERE guild_id = ?"
  ),
  cleanupDeletedChannels: db.prepare(
    "DELETE FROM deleted_channels WHERE deleted_at < ?"
  ),

  insertDeletedRole: db.prepare(
    "INSERT INTO deleted_roles (guild_id, role_id, metadata, deleted_at) VALUES (?, ?, ?, ?)"
  ),
  getDeletedRoles: db.prepare(
    "SELECT * FROM deleted_roles WHERE guild_id = ? AND deleted_at > ? ORDER BY deleted_at DESC"
  ),
  clearDeletedRoles: db.prepare("DELETE FROM deleted_roles WHERE guild_id = ?"),
  cleanupDeletedRoles: db.prepare(
    "DELETE FROM deleted_roles WHERE deleted_at < ?"
  ),

  insertBannedUser: db.prepare(
    "INSERT INTO banned_users (guild_id, user_id, executor_id, banned_at) VALUES (?, ?, ?, ?)"
  ),
  getBannedUsers: db.prepare(
    "SELECT user_id FROM banned_users WHERE guild_id = ? AND executor_id = ? AND banned_at > ?"
  ),
  clearBannedUsers: db.prepare(
    "DELETE FROM banned_users WHERE guild_id = ? AND executor_id = ?"
  ),
  cleanupBanned: db.prepare("DELETE FROM banned_users WHERE banned_at < ?"),

  insertKickedUser: db.prepare(
    "INSERT INTO kicked_users (guild_id, user_id, executor_id, kicked_at) VALUES (?, ?, ?, ?)"
  ),
  getKickedUsers: db.prepare(
    "SELECT user_id FROM kicked_users WHERE guild_id = ? AND executor_id = ? AND kicked_at > ?"
  ),
  clearKickedUsers: db.prepare(
    "DELETE FROM kicked_users WHERE guild_id = ? AND executor_id = ?"
  ),
  cleanupKicked: db.prepare("DELETE FROM kicked_users WHERE kicked_at < ?"),

  insertUnbannedUser: db.prepare(
    "INSERT INTO unbanned_users (guild_id, user_id, executor_id, unbanned_at) VALUES (?, ?, ?, ?)"
  ),
  getUnbannedUsers: db.prepare(
    "SELECT user_id FROM unbanned_users WHERE guild_id = ? AND executor_id = ? AND unbanned_at > ?"
  ),
  clearUnbannedUsers: db.prepare(
    "DELETE FROM unbanned_users WHERE guild_id = ? AND executor_id = ?"
  ),
  cleanupUnbanned: db.prepare(
    "DELETE FROM unbanned_users WHERE unbanned_at < ?"
  ),

  insertCreatedChannel: db.prepare(
    "INSERT INTO created_channels (guild_id, channel_id, created_at) VALUES (?, ?, ?)"
  ),
  getCreatedChannels: db.prepare(
    "SELECT channel_id FROM created_channels WHERE guild_id = ? AND created_at > ?"
  ),
  clearCreatedChannels: db.prepare(
    "DELETE FROM created_channels WHERE guild_id = ?"
  ),
  cleanupCreatedChannels: db.prepare(
    "DELETE FROM created_channels WHERE created_at < ?"
  ),

  insertCreatedRole: db.prepare(
    "INSERT INTO created_roles (guild_id, role_id, created_at) VALUES (?, ?, ?)"
  ),
  getCreatedRoles: db.prepare(
    "SELECT role_id FROM created_roles WHERE guild_id = ? AND created_at > ?"
  ),
  clearCreatedRoles: db.prepare("DELETE FROM created_roles WHERE guild_id = ?"),
  cleanupCreatedRoles: db.prepare(
    "DELETE FROM created_roles WHERE created_at < ?"
  ),

  insertOriginalChannel: db.prepare(
    "INSERT OR IGNORE INTO original_channels (guild_id, channel_id, metadata, saved_at) VALUES (?, ?, ?, ?)"
  ),
  getOriginalChannel: db.prepare(
    "SELECT metadata FROM original_channels WHERE guild_id = ? AND channel_id = ?"
  ),
  getOriginalChannels: db.prepare(
    "SELECT channel_id, metadata FROM original_channels WHERE guild_id = ? AND saved_at > ?"
  ),
  deleteOriginalChannel: db.prepare(
    "DELETE FROM original_channels WHERE guild_id = ? AND channel_id = ?"
  ),
  clearOriginalChannels: db.prepare(
    "DELETE FROM original_channels WHERE guild_id = ?"
  ),
  cleanupOriginalChannels: db.prepare(
    "DELETE FROM original_channels WHERE saved_at < ?"
  ),

  insertOriginalRole: db.prepare(
    "INSERT OR IGNORE INTO original_roles (guild_id, role_id, metadata, saved_at) VALUES (?, ?, ?, ?)"
  ),
  getOriginalRole: db.prepare(
    "SELECT metadata FROM original_roles WHERE guild_id = ? AND role_id = ?"
  ),
  getOriginalRoles: db.prepare(
    "SELECT role_id, metadata FROM original_roles WHERE guild_id = ? AND saved_at > ?"
  ),
  deleteOriginalRole: db.prepare(
    "DELETE FROM original_roles WHERE guild_id = ? AND role_id = ?"
  ),
  clearOriginalRoles: db.prepare(
    "DELETE FROM original_roles WHERE guild_id = ?"
  ),
  cleanupOriginalRoles: db.prepare(
    "DELETE FROM original_roles WHERE saved_at < ?"
  ),

  insertOriginalMember: db.prepare(
    "INSERT OR IGNORE INTO original_members (guild_id, member_id, role_ids, saved_at) VALUES (?, ?, ?, ?)"
  ),
  getOriginalMember: db.prepare(
    "SELECT role_ids FROM original_members WHERE guild_id = ? AND member_id = ?"
  ),
  getOriginalMembers: db.prepare(
    "SELECT member_id, role_ids FROM original_members WHERE guild_id = ? AND saved_at > ?"
  ),
  deleteOriginalMember: db.prepare(
    "DELETE FROM original_members WHERE guild_id = ? AND member_id = ?"
  ),
  clearOriginalMembers: db.prepare(
    "DELETE FROM original_members WHERE guild_id = ?"
  ),
  cleanupOriginalMembers: db.prepare(
    "DELETE FROM original_members WHERE saved_at < ?"
  ),

  insertOriginalServer: db.prepare(
    "INSERT OR IGNORE INTO original_server (guild_id, metadata, saved_at) VALUES (?, ?, ?)"
  ),
  getOriginalServer: db.prepare(
    "SELECT metadata FROM original_server WHERE guild_id = ?"
  ),
  deleteOriginalServer: db.prepare(
    "DELETE FROM original_server WHERE guild_id = ?"
  ),
  cleanupOriginalServer: db.prepare(
    "DELETE FROM original_server WHERE saved_at < ?"
  ),
};

export function recordAction(userId, guildId, actionType) {
  stmts.insertAction.run(userId, guildId, actionType, Date.now());
}
export function countActions(userId, guildId, actionType, timeWindow) {
  return stmts.countActions.get(
    userId,
    guildId,
    actionType,
    Date.now() - timeWindow
  ).count;
}
export function clearUserActions(userId, guildId, actionType) {
  stmts.deleteUserActions.run(userId, guildId, actionType);
}

export function saveDeletedChannel(guildId, channelId, metadata) {
  stmts.insertDeletedChannel.run(
    guildId,
    channelId,
    JSON.stringify(metadata),
    Date.now()
  );
}
export function getDeletedChannels(guildId, withinMs = 60000) {
  return stmts.getDeletedChannels
    .all(guildId, Date.now() - withinMs)
    .map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }));
}
export function clearDeletedChannels(guildId) {
  stmts.clearDeletedChannels.run(guildId);
}

export function saveDeletedRole(guildId, roleId, metadata) {
  stmts.insertDeletedRole.run(
    guildId,
    roleId,
    JSON.stringify(metadata),
    Date.now()
  );
}
export function getDeletedRoles(guildId, withinMs = 60000) {
  return stmts.getDeletedRoles
    .all(guildId, Date.now() - withinMs)
    .map((r) => ({ ...r, metadata: JSON.parse(r.metadata) }));
}
export function clearDeletedRoles(guildId) {
  stmts.clearDeletedRoles.run(guildId);
}

export function saveBannedUser(guildId, userId, executorId) {
  stmts.insertBannedUser.run(guildId, userId, executorId, Date.now());
}
export function getBannedUsers(guildId, executorId, withinMs = 60000) {
  return stmts.getBannedUsers
    .all(guildId, executorId, Date.now() - withinMs)
    .map((r) => r.user_id);
}
export function clearBannedUsers(guildId, executorId) {
  stmts.clearBannedUsers.run(guildId, executorId);
}

export function saveKickedUser(guildId, userId, executorId) {
  stmts.insertKickedUser.run(guildId, userId, executorId, Date.now());
}
export function getKickedUsers(guildId, executorId, withinMs = 60000) {
  return stmts.getKickedUsers
    .all(guildId, executorId, Date.now() - withinMs)
    .map((r) => r.user_id);
}
export function clearKickedUsers(guildId, executorId) {
  stmts.clearKickedUsers.run(guildId, executorId);
}

export function saveUnbannedUser(guildId, userId, executorId) {
  stmts.insertUnbannedUser.run(guildId, userId, executorId, Date.now());
}
export function getUnbannedUsers(guildId, executorId, withinMs = 60000) {
  return stmts.getUnbannedUsers
    .all(guildId, executorId, Date.now() - withinMs)
    .map((r) => r.user_id);
}
export function clearUnbannedUsers(guildId, executorId) {
  stmts.clearUnbannedUsers.run(guildId, executorId);
}

export function saveCreatedChannel(guildId, channelId) {
  stmts.insertCreatedChannel.run(guildId, channelId, Date.now());
}
export function getCreatedChannels(guildId, withinMs = 60000) {
  return stmts.getCreatedChannels
    .all(guildId, Date.now() - withinMs)
    .map((r) => r.channel_id);
}
export function clearCreatedChannels(guildId) {
  stmts.clearCreatedChannels.run(guildId);
}

export function saveCreatedRole(guildId, roleId) {
  stmts.insertCreatedRole.run(guildId, roleId, Date.now());
}
export function getCreatedRoles(guildId, withinMs = 60000) {
  return stmts.getCreatedRoles
    .all(guildId, Date.now() - withinMs)
    .map((r) => r.role_id);
}
export function clearCreatedRoles(guildId) {
  stmts.clearCreatedRoles.run(guildId);
}

export function saveOriginalChannel(guildId, channelId, metadata) {
  stmts.insertOriginalChannel.run(
    guildId,
    channelId,
    JSON.stringify(metadata),
    Date.now()
  );
}
export function getOriginalChannel(guildId, channelId) {
  const row = stmts.getOriginalChannel.get(guildId, channelId);
  return row ? JSON.parse(row.metadata) : null;
}
export function getOriginalChannels(guildId, withinMs = 60000) {
  return stmts.getOriginalChannels
    .all(guildId, Date.now() - withinMs)
    .map((r) => ({
      channelId: r.channel_id,
      metadata: JSON.parse(r.metadata),
    }));
}
export function deleteOriginalChannel(guildId, channelId) {
  stmts.deleteOriginalChannel.run(guildId, channelId);
}
export function clearOriginalChannels(guildId) {
  stmts.clearOriginalChannels.run(guildId);
}

export function saveOriginalRole(guildId, roleId, metadata) {
  stmts.insertOriginalRole.run(
    guildId,
    roleId,
    JSON.stringify(metadata),
    Date.now()
  );
}
export function getOriginalRole(guildId, roleId) {
  const row = stmts.getOriginalRole.get(guildId, roleId);
  return row ? JSON.parse(row.metadata) : null;
}
export function getOriginalRoles(guildId, withinMs = 60000) {
  return stmts.getOriginalRoles
    .all(guildId, Date.now() - withinMs)
    .map((r) => ({ roleId: r.role_id, metadata: JSON.parse(r.metadata) }));
}
export function deleteOriginalRole(guildId, roleId) {
  stmts.deleteOriginalRole.run(guildId, roleId);
}
export function clearOriginalRoles(guildId) {
  stmts.clearOriginalRoles.run(guildId);
}

export function saveOriginalMember(guildId, memberId, roleIds) {
  stmts.insertOriginalMember.run(
    guildId,
    memberId,
    JSON.stringify(roleIds),
    Date.now()
  );
}
export function getOriginalMember(guildId, memberId) {
  const row = stmts.getOriginalMember.get(guildId, memberId);
  return row ? JSON.parse(row.role_ids) : null;
}
export function getOriginalMembers(guildId, withinMs = 60000) {
  return stmts.getOriginalMembers
    .all(guildId, Date.now() - withinMs)
    .map((r) => ({ memberId: r.member_id, roleIds: JSON.parse(r.role_ids) }));
}
export function deleteOriginalMember(guildId, memberId) {
  stmts.deleteOriginalMember.run(guildId, memberId);
}
export function clearOriginalMembers(guildId) {
  stmts.clearOriginalMembers.run(guildId);
}

export function saveOriginalServer(guildId, metadata) {
  stmts.insertOriginalServer.run(guildId, JSON.stringify(metadata), Date.now());
}

export function getOriginalServer(guildId) {
  const row = stmts.getOriginalServer.get(guildId);
  return row ? JSON.parse(row.metadata) : null;
}
export function deleteOriginalServer(guildId) {
  stmts.deleteOriginalServer.run(guildId);
}

export function runCleanup(timeWindow) {
  const cutoff = Date.now() - timeWindow;
  stmts.cleanupActions.run(cutoff);
  stmts.cleanupDeletedChannels.run(cutoff);
  stmts.cleanupDeletedRoles.run(cutoff);
  stmts.cleanupBanned.run(cutoff);
  stmts.cleanupKicked.run(cutoff);
  stmts.cleanupUnbanned.run(cutoff);
  stmts.cleanupCreatedChannels.run(cutoff);
  stmts.cleanupCreatedRoles.run(cutoff);
  stmts.cleanupOriginalChannels.run(cutoff);
  stmts.cleanupOriginalRoles.run(cutoff);
  stmts.cleanupOriginalMembers.run(cutoff);
  stmts.cleanupOriginalServer.run(cutoff);
}

export function closeDb() {
  db.close();
}

/**
 * =========================================================
 * For any queries or issues: https://discord.gg/NUPbGzY8Be
 * Made with love by Team Zyrus ❤️
 * =========================================================
 */
