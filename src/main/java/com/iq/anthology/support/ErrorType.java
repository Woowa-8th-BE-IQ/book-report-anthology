package com.iq.anthology.support;

public enum ErrorType {

    NOT_FOUND(404),
    FORBIDDEN(403),
    CONFLICT(409),
    RULE_VIOLATION(422);

    private final int status;

    ErrorType(int status) {
        this.status = status;
    }

    public int status() {
        return status;
    }
}
