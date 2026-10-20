package com.iq.anthology.support;

import java.security.SecureRandom;
import java.util.UUID;

public class SecureIdentifierGenerator implements IdentifierGenerator {

    /** 헷갈리는 글자(0, o, 1, l, i)를 뺀 31자. */
    private static final char[] ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789".toCharArray();
    private static final int CODE_LENGTH = 8;

    private final SecureRandom random = new SecureRandom();

    @Override
    public String anthologyCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return code.toString();
    }

    @Override
    public String participantToken() {
        return UUID.randomUUID().toString();
    }
}
