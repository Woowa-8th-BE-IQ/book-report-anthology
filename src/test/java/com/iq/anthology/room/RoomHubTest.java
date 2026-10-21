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
}
