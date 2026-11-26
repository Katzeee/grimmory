ALTER TABLE ebook_viewer_preference
    ADD COLUMN IF NOT EXISTS folio_cjk_font VARCHAR(20);
