package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.room.Avatar;
import com.iq.anthology.room.RoomMessage;
import com.iq.anthology.room.RoomService.Room;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** 모임방 화면에 필요한 값. 아바타는 서버가 그려서 넣는다. */
public record RoomView(Anthology anthology, Long meId, List<Member> members, List<Line> lines, int onlineCount) {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("M월 d일");

    static RoomView of(Room room, Shelf shelf) {
        Anthology anthology = room.anthology();
        List<Member> members = anthology.contributors().stream()
                .map(contributor -> new Member(contributor.id(), contributor.nickname(), contributor.byline(),
                        Avatar.svg(contributor.nickname(), contributor.joinOrder()), contributor.isEditor(),
                        contributor.id().equals(room.me().id()), room.online().contains(contributor.id()),
                        shelf.hasSubmitted(contributor)))
                .toList();
        Map<Long, Member> byId = members.stream().collect(Collectors.toMap(Member::id, Function.identity()));
        List<Line> lines = new java.util.ArrayList<>();
        String lastDay = null;
        for (RoomMessage message : room.messages()) {
            Member author = byId.get(message.contributorId());
            if (author == null) {
                continue; // 내보낸 사람의 말
            }
            String day = message.createdAt().format(DAY);
            lines.add(new Line(message.id(), author, message.body(), message.createdAt().format(TIME),
                    day.equals(lastDay) ? null : day));
            lastDay = day;
        }
        return new RoomView(anthology, room.me().id(), members, lines, room.online().size());
    }

    /** 아직 독후감을 내지 않은 사람이 있으면 방에 조심스럽게 알린다. */
    public long notSubmittedCount() {
        return members.stream().filter(member -> !member.submitted()).count();
    }

    public record Member(Long id, String nickname, String byline, String avatar, boolean editor, boolean me,
                         boolean online, boolean submitted) {
    }

    /** day는 날짜가 바뀌는 첫 말에만 있다. */
    public record Line(Long id, Member author, String body, String at, String day) {

        public boolean mine(Long meId) {
            return author.id().equals(meId);
        }
    }
}
