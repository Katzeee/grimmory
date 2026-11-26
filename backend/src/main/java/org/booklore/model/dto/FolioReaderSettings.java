package org.booklore.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Reader settings this fork adds, stored as one value both per book and in the user's global
 * reader settings. Each holds only the settings the reader chose there, and a stored setting the
 * reader no longer has is ignored.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
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
