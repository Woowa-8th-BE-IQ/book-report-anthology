package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.room.Avatar;
import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.room.RoomService.Collection;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 책갈피 모음 화면: 책갈피를 받은 말을 날짜별 대화로. mineOnly면 내가 남긴 것만. */
public record BookmarksView(Anthology anthology, Long meId, List<Day> days, int total, boolean chatInBook) {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("M월 d일");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    static BookmarksView of(Collection collection, boolean mineOnly) {
        Map<Long, Contributor> people = new LinkedHashMap<>();
        collection.anthology().contributors().forEach(contributor -> people.put(contributor.id(), contributor));
        Long me = collection.me().id();
        Map<String, List<Entry>> days = new LinkedHashMap<>();
        int total = 0;
        for (RoomMessage message : collection.messages()) {
            Contributor author = people.get(message.contributorId());
            List<Long> markers = collection.marks().getOrDefault(message.id(), List.of());
            if (author == null || (mineOnly && !markers.contains(me))) {
                continue;
            }
            List<String> names = markers.stream().map(people::get).filter(java.util.Objects::nonNull)
                    .map(Contributor::nickname).toList();
            days.computeIfAbsent(message.createdAt().format(DAY), day -> new ArrayList<>())
                    .add(new Entry(message.id(), author.nickname(), Avatar.of(author), author.id().equals(me),
                            message.body(), message.createdAt().format(TIME), names, markers.contains(me)));
            total++;
        }
        return new BookmarksView(collection.anthology(), me,
                days.entrySet().stream().map(day -> new Day(day.getKey(), day.getValue())).toList(), total,
                collection.chatInBook());
    }

    public record Day(String day, List<Entry> entries) {
    }

    /** markers는 책갈피를 남긴 사람들의 닉네임, marked는 나도 남겼는지. */
    public record Entry(Long id, String author, String avatar, boolean mine, String body, String at,
                        List<String> markers, boolean marked) {

        public String markerLine() {
            return markers.size() <= 3 ? String.join(" · ", markers)
                    : String.join(" · ", markers.subList(0, 3)) + " 외 " + (markers.size() - 3) + "명";
        }
    }
}
