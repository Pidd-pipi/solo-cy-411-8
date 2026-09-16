-- migration: 碳因子版本与生效期（从无版本的 carbon_factors 升级）
-- 幂等：可重复执行。适配已经运行过旧版 001-init.sql 的数据库。
-- MySQL 8.0，存储过程用于“列/索引存在才变更”。

DELIMITER //
DROP PROCEDURE IF EXISTS ct_add_column_if_missing//
CREATE PROCEDURE ct_add_column_if_missing(
  IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_ddl VARCHAR(512)
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN ', p_ddl);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//

DROP PROCEDURE IF EXISTS ct_drop_index_if_exists//
CREATE PROCEDURE ct_drop_index_if_exists(IN p_table VARCHAR(64), IN p_index VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` DROP INDEX `', p_index, '`');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END//
DELIMITER ;

-- 1) carbon_factors 增加版本/生效期/状态
CALL ct_add_column_if_missing('carbon_factors', 'version', "`version` INT NOT NULL DEFAULT 1");
CALL ct_add_column_if_missing('carbon_factors', 'effective_date', "`effective_date` DATE NULL");
CALL ct_add_column_if_missing('carbon_factors', 'status', "`status` ENUM('active','inactive') NOT NULL DEFAULT 'active'");
CALL ct_add_column_if_missing('carbon_factors', 'created_at', "`created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP");

-- 2) 旧数据回填：现存因子视为 v1，从 2000-01-01 起生效（覆盖所有历史活动日期）
UPDATE carbon_factors
SET effective_date = '2000-01-01'
WHERE effective_date IS NULL;

ALTER TABLE carbon_factors MODIFY COLUMN `effective_date` DATE NOT NULL;

-- 3) 唯一约束 + 匹配索引（保证任一日期至多一个版本，同时兜底并发只成功一次）
CALL ct_drop_index_if_exists('carbon_factors', 'uk_factor_version');
ALTER TABLE carbon_factors ADD CONSTRAINT uk_factor_version UNIQUE KEY (region, category, sub_type, effective_date);
-- 版本号在同一因子内唯一（配合应用事务串行化，杜绝并发撞号）
CALL ct_drop_index_if_exists('carbon_factors', 'uk_factor_version_no');
ALTER TABLE carbon_factors ADD CONSTRAINT uk_factor_version_no UNIQUE KEY (region, category, sub_type, version);
CALL ct_drop_index_if_exists('carbon_factors', 'idx_factor_match');
ALTER TABLE carbon_factors ADD KEY idx_factor_match (region, category, sub_type, status, effective_date);

-- 4) activities 增加固化快照列
CALL ct_add_column_if_missing('activities', 'factor_version', "`factor_version` INT NULL");
CALL ct_add_column_if_missing('activities', 'factor_value_snapshot', "`factor_value_snapshot` DECIMAL(12,4) NULL");
CALL ct_add_column_if_missing('activities', 'factor_effective_date', "`factor_effective_date` DATE NULL");

-- 5) 历史活动按当时引用的因子回填快照（全部视作 v1）
UPDATE activities a
JOIN carbon_factors f ON f.id = a.factor_id
SET a.factor_version = COALESCE(a.factor_version, f.version),
    a.factor_value_snapshot = COALESCE(a.factor_value_snapshot, f.factor_value),
    a.factor_effective_date = COALESCE(a.factor_effective_date, f.effective_date)
WHERE a.factor_id IS NOT NULL
  AND (a.factor_version IS NULL OR a.factor_value_snapshot IS NULL OR a.factor_effective_date IS NULL);

DROP PROCEDURE ct_add_column_if_missing;
DROP PROCEDURE ct_drop_index_if_exists;
