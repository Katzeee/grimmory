package org.booklore.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Reader settings this fork adds, stored as one value both per book and in the user's global
 * reader settings. A setting left out follows the book.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FolioReaderSettings {
    private String writingMode;
    private String pageDirection;
    private String cjkFont;
}
