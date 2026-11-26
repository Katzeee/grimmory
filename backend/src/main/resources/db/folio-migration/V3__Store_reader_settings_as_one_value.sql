ALTER TABLE ebook_viewer_preference
    ADD COLUMN IF NOT EXISTS folio_settings JSON,
    DROP COLUMN IF EXISTS folio_writing_mode,
    DROP COLUMN IF EXISTS folio_page_direction,
    DROP COLUMN IF EXISTS folio_cjk_font;
