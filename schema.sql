DROP TABLE IF EXISTS post_chunks;
DROP TABLE IF EXISTS posts;

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_name TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_chunks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX idx_post_chunks_post_id ON post_chunks(post_id);
