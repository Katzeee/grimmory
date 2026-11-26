package org.booklore.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EpubBookInfo {
    private String containerPath;
    private String rootPath;
    private List<EpubSpineItem> spine;
    private List<EpubManifestItem> manifest;
    private EpubTocItem toc;
    private Map<String, Object> metadata;
    private String coverPath;
    // Every file in the archive, so a client can read it the way it reads a local EPUB
    private List<String> entries;
}
