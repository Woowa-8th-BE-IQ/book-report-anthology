package com.iq.anthology.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RoomViewTest {

    @Test
    void 첫_자리는_책상_위쪽_가운데다() {
        assertThat(RoomView.seat(0, 6)).containsExactly(0.5, 0.12);
    }

    @Test
    void 열다섯_번째부터는_바깥_바퀴에_앉는다() {
        double[] inner = RoomView.seat(13, 20);
        double[] outer = RoomView.seat(14, 20);

        assertThat(distance(inner)).isCloseTo(0.38, org.assertj.core.data.Offset.offset(0.002));
        assertThat(distance(outer)).isCloseTo(0.465, org.assertj.core.data.Offset.offset(0.002));
    }

    @Test
    void 모든_자리는_방_안에_있다() {
        for (int count = 1; count <= 60; count++) {
            for (int i = 0; i < count; i++) {
                double[] seat = RoomView.seat(i, count);
                assertThat(seat[0]).isBetween(0.0, 1.0);
                assertThat(seat[1]).isBetween(0.0, 1.0);
            }
        }
    }

    private static double distance(double[] seat) {
        return Math.hypot(seat[0] - 0.5, seat[1] - 0.5);
    }
}
