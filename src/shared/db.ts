import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const DB_PATH = path.join("data", "mvp.sqlite");

export function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      food_group TEXT NOT NULL,
      quantity REAL,
      unit TEXT,
      quantity_estimated INTEGER NOT NULL,
      off_matched INTEGER NOT NULL,
      off_product_name TEXT,
      off_nutri_score TEXT,
      off_nutrients_json TEXT
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY,
      retailer TEXT NOT NULL,
      date TEXT NOT NULL,
      total REAL NOT NULL,
      source_file TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS receipt_items (
      id INTEGER PRIMARY KEY,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id),
      item_id INTEGER NOT NULL REFERENCES items(id),
      count INTEGER NOT NULL,
      price REAL NOT NULL
    );
  `);
  return db;
}
