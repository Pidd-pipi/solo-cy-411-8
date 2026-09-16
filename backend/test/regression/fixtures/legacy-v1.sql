-- 旧库夹具：版本化功能“上线前”的线上 v1 结构 + 存量数据。
-- 刻意不含 carbon_factors.version/effective_date/status，也不含 activities 快照列，
-- 用于回归“保留命名卷的旧库直接用新版后端启动”的升级路径。
-- 密码哈希与 init.sql 一致，明文为 password123。

CREATE TABLE roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(32) NOT NULL UNIQUE,
  description VARCHAR(128) NOT NULL
);

CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(128) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  avatar VARCHAR(255) NULL,
  region VARCHAR(64) NOT NULL DEFAULT 'Shanghai',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  UNIQUE KEY uk_user_role (user_id, role_id)
);

-- 旧因子表：无版本列
CREATE TABLE carbon_factors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  category ENUM('transport','energy','food','shopping') NOT NULL,
  sub_type VARCHAR(64) NOT NULL,
  factor_value DECIMAL(12,4) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  region VARCHAR(64) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_factor_category_region (category, region)
);

-- 旧活动表：无固化快照列
CREATE TABLE activities (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  factor_id BIGINT NULL,
  category ENUM('transport','energy','food','shopping') NOT NULL,
  sub_type VARCHAR(64) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  carbon_value DECIMAL(12,2) NOT NULL,
  record_date DATE NOT NULL,
  note VARCHAR(255) NULL,
  KEY idx_activity_user_date (user_id, record_date)
);

CREATE TABLE goals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(128) NOT NULL,
  target_value DECIMAL(12,2) NOT NULL,
  period_type VARCHAR(32) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('pending','active','completed','expired') NOT NULL DEFAULT 'active',
  KEY idx_goal_user_status (user_id, status)
);

CREATE TABLE audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  action VARCHAR(64) NOT NULL,
  entity VARCHAR(64) NOT NULL,
  entity_id BIGINT NULL,
  detail TEXT NOT NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'Administrator'),
  (2, 'member', 'Regular user');

INSERT INTO users (id, username, email, password_hash, avatar, region) VALUES
  (1, 'demo', 'demo@carbontrack.local', '$2a$10$R/pa680dmGNIktP04Zi6VubvDaD0dzlAu6S842B38YzsVcvJiz69G', '', 'Shanghai'),
  (2, 'river-ops', 'river@carbontrack.local', '$2a$10$R/pa680dmGNIktP04Zi6VubvDaD0dzlAu6S842B38YzsVcvJiz69G', '', 'Hangzhou');

INSERT INTO user_roles (user_id, role_id) VALUES (1, 1), (1, 2), (2, 2);

INSERT INTO carbon_factors (id, category, sub_type, factor_value, unit, region) VALUES
  (1, 'energy', 'electricity', 0.5700, 'kWh', 'Shanghai'),
  (2, 'energy', 'electricity', 0.5300, 'kWh', 'Hangzhou'),
  (3, 'transport', 'metro', 0.0520, 'km', 'Shanghai');

INSERT INTO activities (id, user_id, factor_id, category, sub_type, amount, unit, carbon_value, record_date, note) VALUES
  (1, 1, 1, 'energy', 'electricity', 10.00, 'kWh', 5.70, '2026-01-10', 'legacy shanghai power'),
  (2, 1, 3, 'transport', 'metro', 100.00, 'km', 5.20, '2026-02-11', 'legacy metro'),
  (3, 2, 2, 'energy', 'electricity', 20.00, 'kWh', 10.60, '2026-03-12', 'legacy hangzhou power');

INSERT INTO goals (id, user_id, title, target_value, period_type, start_date, end_date, status) VALUES
  (1, 1, 'legacy goal', 100.00, 'month', '2026-01-01', '2026-01-31', 'active');

INSERT INTO audit_logs (id, user_id, action, entity, entity_id, detail, ip) VALUES
  (1, 1, 'seed', 'System', 1, 'legacy fixture', '127.0.0.1');
