package com.iq.anthology.fake;

import com.iq.anthology.activity.ActivityLog;
import com.iq.anthology.activity.ActivityType;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** 메모리 기록. 실제 구현과 같은 기준(서로 다른 사람·쌍)으로 센다. */
public class FakeActivityLog implements ActivityLog {

    private final List<Entry> entries = new ArrayList<>();

    @Override
    public void record(Long anthologyId, Long contributorId, ActivityType type, Long essayId) {
        entries.add(new Entry(anthologyId, contributorId, type, essayId));
    }

    @Override
    public Engagement engagement(Long anthologyId) {
        Set<Long> readers = new HashSet<>();
        Set<List<Long>> pairs = new HashSet<>();
        Set<Long> downloaded = new HashSet<>();
        long aboutViews = 0;
        for (Entry entry : entries) {
            if (!Objects.equals(entry.anthologyId(), anthologyId)) {
                continue;
            }
            switch (entry.type()) {
                case READ_OTHERS -> {
                    readers.add(entry.contributorId());
                    pairs.add(List.of(entry.contributorId(), entry.essayId()));
                }
                case EPUB_DOWNLOADED, PDF_DOWNLOADED -> downloaded.add(entry.contributorId());
                case ABOUT_VIEWED -> aboutViews++;
                default -> { }
            }
        }
        return new Engagement(readers.size(), pairs.size(), downloaded.size(), aboutViews);
    }

    @Override
    public void forgetContributor(Long contributorId) {
        entries.removeIf(entry -> Objects.equals(entry.contributorId(), contributorId));
    }

    public List<ActivityType> types() {
        return entries.stream().map(Entry::type).toList();
    }

    private record Entry(Long anthologyId, Long contributorId, ActivityType type, Long essayId) {
    }
}
