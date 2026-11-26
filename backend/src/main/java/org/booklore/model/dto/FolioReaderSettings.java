package org.booklore.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Reader settings this fork adds, stored as one value both per book and in the user's global
 * reader settings. A setting left out follows the book, and a stored setting the reader no longer
 * has is ignored.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FolioReaderSettings {
    private String writingMode;
    private String pageDirection;
    private String serifFont;
    private String sansSerifFont;
    private String fontOverride;
    private String rubyDisplay;
}
