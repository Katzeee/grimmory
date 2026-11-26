ALTER TABLE ebook_viewer_preference
    ADD COLUMN IF NOT EXISTS folio_writing_mode VARCHAR(20),
    ADD COLUMN IF NOT EXISTS folio_page_direction VARCHAR(20);
