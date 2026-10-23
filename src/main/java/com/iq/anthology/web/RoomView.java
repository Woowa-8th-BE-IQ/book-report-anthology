package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.room.Avatar;
import com.iq.anthology.room.RoomHub;
import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.room.RoomService.Room;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 모임방 화면에 필요한 값. 아바타는 서버가 그려서 넣는다. */
public record RoomView(Anthology anthology, Long meId, List<Member> members, List<Line> lines, int onlineCount,
                       int unread, long lastRead) {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("M월 d일");

    static RoomView of(Room room, Shelf shelf, java.time.LocalDateTime now) {
        Anthology anthology = room.anthology();
        List<Contributor> contributors = anthology.contributors();
        List<Member> members = new java.util.ArrayList<>();
        for (int i = 0; i < contributors.size(); i++) {
            Contributor contributor = contributors.get(i);
            double[] seat = seat(i, contributors.size());
            RoomHub.Position walked = room.positions().get(contributor.id());
            members.add(new Member(contributor.id(), contributor.nickname(), contributor.byline(),
                    Avatar.of(contributor), contributor.isEditor(),
                    contributor.id().equals(room.me().id()), room.online().contains(contributor.id()),
                    shelf.hasSubmitted(contributor), seat[0], seat[1],
                    walked == null ? seat[0] : walked.x(), walked == null ? seat[1] : walked.y(),
                    com.iq.anthology.support.Texts.ago(contributor.lastSeenAt(), now)));
        }
        Map<Long, Member> byId = members.stream().collect(Collectors.toMap(Member::id, Function.identity()));
        List<Line> lines = new java.util.ArrayList<>();
        String lastDay = null;
        for (RoomMessage message : room.messages()) {
            Member author = byId.get(message.contributorId());
            if (author == null) {
                continue; // 내보낸 사람의 말
            }
            String day = message.createdAt().format(DAY);
            boolean callsMe = com.iq.anthology.room.Mentions.find(message.body(), contributors, message.contributorId())
                    .contains(room.me().id());
            List<Long> markers = room.marks().getOrDefault(message.id(), List.of());
            lines.add(new Line(message.id(), author, message.body(), message.createdAt().format(TIME),
                    day.equals(lastDay) ? null : day, callsMe, markers.size(), markers.contains(room.me().id())));
            lastDay = day;
        }
        return new RoomView(anthology, room.me().id(), members, lines, room.online().size(), room.unread(),
                room.lastRead());
    }

    public Member me() {
        return members.stream().filter(Member::me).findFirst().orElseThrow();
    }

    /** 최근 말 count개(펫 대화창용). */
    public List<Line> lastLines(int count) {
        return lines.subList(Math.max(0, lines.size() - count), lines.size());
    }

    /**
     * 책상 둘레의 제자리. 14명까지는 한 바퀴, 넘으면 바깥에 한 바퀴 더(20자리). 그보다 많으면 바깥 바퀴에 겹쳐 앉는다.
     * 값은 방 너비·높이에 대한 비율(0~1)이다.
     */
    static double[] seat(int index, int count) {
        int inner = Math.min(count, 14);
        boolean onInner = index < inner;
        int ringSize = onInner ? inner : Math.max(1, Math.min(count - 14, 20));
        int position = onInner ? index : (index - 14) % 20;
        double radius = onInner ? 0.38 : 0.465;
        double offset = onInner ? 0 : Math.PI / ringSize;
        double angle = 2 * Math.PI * position / ringSize - Math.PI / 2 + offset;
        return new double[]{round(0.5 + radius * Math.cos(angle)), round(0.5 + radius * Math.sin(angle))};
    }

    private static double round(double value) {
        return Math.round(value * 1000) / 1000.0;
    }

    /** seatX·seatY는 제자리, x·y는 지금 서 있는 자리(걸어갔으면 그곳). */
    public record Member(Long id, String nickname, String byline, String avatar, boolean editor, boolean me,
                         boolean online, boolean submitted, double seatX, double seatY, double x, double y,
                         String lastSeen) {
    }

    /** 안 읽은 말 중 나를 부른 말이 있는지(펫 배지를 "@"로 바꾼다). */
    public boolean calledWhileAway() {
        return lines.stream().anyMatch(line -> line.callsMe() && line.id() > lastRead);
    }

    /** day는 날짜가 바뀌는 첫 말에만 있다. callsMe는 이 말이 "@내 닉네임"으로 나를 불렀는지. */
    /** marks는 책갈피 수, marked는 내가 책갈피를 남겼는지. */
    public record Line(Long id, Member author, String body, String at, String day, boolean callsMe, int marks,
                       boolean marked) {

        public boolean mine(Long meId) {
            return author.id().equals(meId);
        }
    }
}
