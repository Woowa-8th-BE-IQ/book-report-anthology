package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.essay.Shelf;
import com.iq.anthology.room.RoomService.Room;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 꼬깃 서고 화면에 필요한 값. 사람(아바타)은 모임방과 같은 것을 쓰고,
 * 펼친 책 조형물·책장 탑·게시판에 띄울 문집 이야기를 더한다.
 *
 * @param stars 서고 천장에 매달 책갈피 별 수(이 문집에서 지금까지 꽂은 책갈피)
 */
public record LibraryView(RoomView room, Anthology anthology, long submitted, int total, String due,
                          List<String> prompts, int stars) {

    static LibraryView of(Room room, Shelf shelf, java.time.LocalDateTime now) {
        Anthology anthology = room.anthology();
        int stars = room.marks().values().stream().mapToInt(List::size).sum();
        return new LibraryView(RoomView.of(room, shelf, now), anthology, shelf.submittedCount(),
                anthology.contributors().size(), dueText(anthology, now.toLocalDate()), anthology.prompts(), stars);
    }

    /** 마감까지 남은 날. 예: "마감 D-3", "오늘 마감", "마감했어요" */
    static String dueText(Anthology anthology, LocalDate today) {
        if (anthology.isClosed()) {
            return "마감했어요";
        }
        long days = ChronoUnit.DAYS.between(today, anthology.dueDate());
        if (days < 0) {
            return "마감일이 지났어요";
        }
        return days == 0 ? "오늘 마감" : "마감 D-" + days;
    }
}
