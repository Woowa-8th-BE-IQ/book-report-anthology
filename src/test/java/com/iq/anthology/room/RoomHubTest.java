package com.iq.anthology.room;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.iq.anthology.room.RoomHub.Position;
import com.iq.anthology.support.ErrorType;
import org.junit.jupiter.api.Test;

class RoomHubTest {

    private final RoomHub hub = new RoomHub();

    @Test
    void 자리는_방_밖으로_나가지_않는다() {
        assertThat(new Position(-0.3, 1.7)).isEqualTo(new Position(0, 1));
        assertThat(new Position(0.12345, 0.5)).isEqualTo(new Position(0.123, 0.5));
    }

    @Test
    void 숫자가_아닌_자리는_거절한다() {
        assertThatThrownBy(() -> new Position(Double.NaN, 0.5))
                .extracting("type").isEqualTo(ErrorType.RULE_VIOLATION);
    }

    @Test
    void 방에_있는_사람만_움직일_수_있다() {
        hub.move(1L, 10L, new Position(0.2, 0.2));
        assertThat(hub.positionsOf(1L)).isEmpty();

        hub.join(1L, 10L);
        hub.move(1L, 10L, new Position(0.2, 0.3));

        assertThat(hub.online(1L)).containsExactly(10L);
        assertThat(hub.positionsOf(1L)).containsEntry(10L, new Position(0.2, 0.3));
    }

    @Test
    void 아무도_걷지_않은_방에서_나가도_바로_빠지고_마지막_접속이_남는다() {
        java.util.List<Long> left = new java.util.ArrayList<>();
        hub.onLeave((anthologyId, contributorId) -> left.add(contributorId));
        hub.join(1L, 10L);
        hub.join(1L, 11L);

        hub.kick(1L, 11L);

        assertThat(hub.online(1L)).containsExactly(10L);
        assertThat(left).containsExactly(11L);
    }

    @Test
    void 서고에서는_서고에_들어온_사람만_움직이고_자리_하나에는_한_사람만_앉는다() {
        hub.join(1L, 10L); // 모임방에만
        hub.moveInLibrary(1L, 10L, new RoomHub.Spot(new Position(0.5, 0.5), null, "read"));
        assertThat(hub.librarySpotsOf(1L)).isEmpty();

        hub.join(1L, 10L, true);
        hub.join(1L, 11L, true);
        assertThat(hub.inLibrary(1L)).containsExactly(10L, 11L);
        assertThat(hub.online(1L)).containsExactly(10L, 11L); // 서고에 있어도 모임방에 있는 것으로 센다

        assertThat(hub.moveInLibrary(1L, 10L, new RoomHub.Spot(new Position(0.3, 0.4), "bench-1", "write"))).isTrue();
        assertThat(hub.moveInLibrary(1L, 11L, new RoomHub.Spot(new Position(0.3, 0.4), "bench-1", null))).isFalse();
        assertThat(hub.librarySpotsOf(1L).get(10L).seat()).isEqualTo("bench-1");
        assertThat(hub.librarySpotsOf(1L)).doesNotContainKey(11L);

        // 일어나면 다른 사람이 앉을 수 있다
        hub.moveInLibrary(1L, 10L, new RoomHub.Spot(new Position(0.3, 0.45), null, "write"));
        assertThat(hub.moveInLibrary(1L, 11L, new RoomHub.Spot(new Position(0.3, 0.4), "bench-1", null))).isTrue();
    }

    @Test
    void 서고_자리_이름과_상태는_정해진_모양만_받는다() {
        RoomHub.Spot spot = new RoomHub.Spot(new Position(0.1, 0.1), "<script>", "dance");

        assertThat(spot.seat()).isNull();
        assertThat(spot.status()).isEqualTo("read");
        assertThat(new RoomHub.Spot(new Position(0.1, 0.1), "tl-2", "rest").seat()).isEqualTo("tl-2");
    }

    @Test
    void 서고에서_나가면_서고_자리도_지워진다() {
        hub.join(1L, 10L, true);
        hub.join(1L, 11L, true);
        hub.moveInLibrary(1L, 11L, new RoomHub.Spot(new Position(0.2, 0.2), "nook-l", "rest"));

        hub.kick(1L, 11L);

        assertThat(hub.inLibrary(1L)).containsExactly(10L);
        assertThat(hub.librarySpotsOf(1L)).doesNotContainKey(11L);
    }
}
