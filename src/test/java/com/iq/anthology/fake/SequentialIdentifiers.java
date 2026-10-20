package com.iq.anthology.fake;

import com.iq.anthology.support.IdentifierGenerator;
import java.util.concurrent.atomic.AtomicInteger;

/** 예측 가능한 코드·토큰. code-1, token-1, token-2 ... */
public class SequentialIdentifiers implements IdentifierGenerator {

    private final AtomicInteger codes = new AtomicInteger(1);
    private final AtomicInteger tokens = new AtomicInteger(1);

    @Override
    public String anthologyCode() {
        return "code-" + codes.getAndIncrement();
    }

    @Override
    public String participantToken() {
        return "token-" + tokens.getAndIncrement();
    }
}
