CREATE TABLE IF NOT EXISTS roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE,
  description VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(128) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  avatar VARCHAR(255) NULL,
  region VARCHAR(64) NOT NULL DEFAULT 'Shanghai',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  UNIQUE KEY uk_user_role (user_id, role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- CarbonFactor 现在是“版本化因子”：同一 region + category + sub_type 下，
-- 每个生效日期最多一个版本（uk_factor_version）。
-- 生效区间为左闭右开 [effective_date, 下一版本 effective_date)，
-- 因此同一地区/分类/子类型在任一日期只会匹配到一个生效版本。
CREATE TABLE IF NOT EXISTS carbon_factors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  category ENUM('transport','energy','food','shopping') NOT NULL,
  sub_type VARCHAR(64) NOT NULL,
  factor_value DECIMAL(12,4) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  region VARCHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  effective_date DATE NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_factor_category_region (category, region),
  KEY idx_factor_match (region, category, sub_type, status, effective_date),
  CONSTRAINT uk_factor_version UNIQUE KEY (region, category, sub_type, effective_date),
  CONSTRAINT uk_factor_version_no UNIQUE KEY (region, category, sub_type, version)
);

-- activities 固化创建/修改当时匹配到的因子版本：
-- factor_id 指向具体版本行；factor_version / factor_value_snapshot / factor_effective_date
-- 作为冗余快照，后续发布或停用版本都不会改变既有活动的 carbon_value。
CREATE TABLE IF NOT EXISTS activities (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  factor_id BIGINT NULL,
  factor_version INT NULL,
  factor_value_snapshot DECIMAL(12,4) NULL,
  factor_effective_date DATE NULL,
  category ENUM('transport','energy','food','shopping') NOT NULL,
  sub_type VARCHAR(64) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  carbon_value DECIMAL(12,2) NOT NULL,
  record_date DATE NOT NULL,
  note VARCHAR(255) NULL,
  CONSTRAINT fk_activities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_activities_factor FOREIGN KEY (factor_id) REFERENCES carbon_factors(id) ON DELETE SET NULL,
  KEY idx_activity_user_date (user_id, record_date),
  KEY idx_activity_category (category)
);

CREATE TABLE IF NOT EXISTS goals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(128) NOT NULL,
  target_value DECIMAL(12,2) NOT NULL,
  period_type VARCHAR(32) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('pending','active','completed','expired') NOT NULL DEFAULT 'active',
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_goal_user_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id BIGINT NULL,
  detail TEXT NOT NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_user_created (user_id, created_at)
);

INSERT IGNORE INTO roles (id, name, description) VALUES
  (1, 'admin', 'Administrator with factor and audit access'),
  (2, 'member', 'Regular CarbonTrack user');

INSERT IGNORE INTO users (id, username, email, password_hash, avatar, region) VALUES
  (1, 'demo', 'demo@carbontrack.local', '$2a$10$R/pa680dmGNIktP04Zi6VubvDaD0dzlAu6S842B38YzsVcvJiz69G', '', 'Shanghai'),
  (2, 'river-ops', 'river@carbontrack.local', '$2a$10$R/pa680dmGNIktP04Zi6VubvDaD0dzlAu6S842B38YzsVcvJiz69G', '', 'Hangzhou'),
  (3, 'north-shop', 'north@carbontrack.local', '$2a$10$R/pa680dmGNIktP04Zi6VubvDaD0dzlAu6S842B38YzsVcvJiz69G', '', 'Beijing');

INSERT IGNORE INTO user_roles (user_id, role_id) VALUES
  (1, 1), (1, 2), (2, 2), (3, 2);

-- 既有因子作为各地区的 v1，从很早的日期起生效，保证历史活动都能匹配。
INSERT IGNORE INTO carbon_factors
  (id, category, sub_type, factor_value, unit, region, version, effective_date, status)
VALUES
  (1, 'transport', 'metro', 0.0520, 'km', 'Shanghai', 1, '2000-01-01', 'active'),
  (2, 'transport', 'gasoline-car', 0.1920, 'km', 'Shanghai', 1, '2000-01-01', 'active'),
  (3, 'energy', 'electricity', 0.5700, 'kWh', 'Shanghai', 1, '2000-01-01', 'active'),
  (4, 'food', 'beef-meal', 6.2000, 'meal', 'Shanghai', 1, '2000-01-01', 'active'),
  (5, 'shopping', 'parcel', 1.1000, 'item', 'Shanghai', 1, '2000-01-01', 'active'),
  (6, 'energy', 'electricity', 0.5300, 'kWh', 'Hangzhou', 1, '2000-01-01', 'active'),
  (7, 'transport', 'bus', 0.0890, 'km', 'Beijing', 1, '2000-01-01', 'active'),
  -- 一条尚未生效的 v2（30 天后生效），用于演示“未来生效版本”。
  (8, 'energy', 'electricity', 0.6100, 'kWh', 'Shanghai', 2, DATE_ADD(CURRENT_DATE(), INTERVAL 30 DAY), 'active');

INSERT IGNORE INTO activities
  (id, user_id, factor_id, factor_version, factor_value_snapshot, factor_effective_date,
   category, sub_type, amount, unit, carbon_value, record_date, note)
VALUES
  (1, 1, 1, 1, 0.0520, '2000-01-01', 'transport', 'metro', 22.50, 'km', 1.17, CURRENT_DATE(), 'Morning commute'),
  (2, 1, 3, 1, 0.5700, '2000-01-01', 'energy', 'electricity', 18.00, 'kWh', 10.26, DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY), 'Office lighting'),
  (3, 1, 4, 1, 6.2000, '2000-01-01', 'food', 'beef-meal', 1.00, 'meal', 6.20, DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY), 'Client lunch'),
  (4, 2, 6, 1, 0.5300, '2000-01-01', 'energy', 'electricity', 26.00, 'kWh', 13.78, DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY), 'Store energy'),
  (5, 3, 7, 1, 0.0890, '2000-01-01', 'transport', 'bus', 18.00, 'km', 1.60, CURRENT_DATE(), 'Supplier visit');

INSERT IGNORE INTO goals (id, user_id, title, target_value, period_type, start_date, end_date, status) VALUES
  (1, 1, 'Keep June emissions under 120 kg', 120.00, 'month', DATE_FORMAT(CURRENT_DATE(), '%Y-%m-01'), LAST_DAY(CURRENT_DATE()), 'active'),
  (2, 1, 'Reduce transport carbon this week', 20.00, 'week', DATE_SUB(CURRENT_DATE(), INTERVAL WEEKDAY(CURRENT_DATE()) DAY), DATE_ADD(DATE_SUB(CURRENT_DATE(), INTERVAL WEEKDAY(CURRENT_DATE()) DAY), INTERVAL 6 DAY), 'active');

INSERT IGNORE INTO audit_logs (id, user_id, action, entity, entity_id, detail, ip) VALUES
  (1, 1, 'seed', 'System', 1, 'System[id=1] seed completed: demo data ready', '127.0.0.1');
