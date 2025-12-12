-- Voer dit uit in phpMyAdmin (tab 'SQL')

CREATE DATABASE IF NOT EXISTS epic3
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE epic3;

CREATE TABLE IF NOT EXISTS products (
  id   VARCHAR(20)  PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50)  NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id            CHAR(36)     PRIMARY KEY,
  employee_name VARCHAR(100) NOT NULL,
  item_id       VARCHAR(20)  NOT NULL,
  date          DATE         NOT NULL,
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  status        ENUM('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_res_item FOREIGN KEY (item_id) REFERENCES products(id)
);

INSERT INTO products (id, name, type) VALUES
('cam1', 'Camera A',        'Apparaat'),
('cam2', 'Camera B',        'Apparaat'),
('mic1', 'Microfoon set',   'Audio'),
('lap1', 'Laptop 13"',     'IT'),
('room1','Vergaderruimte 1','Ruimte'),
('room2','Studio',          'Ruimte')
ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type);
