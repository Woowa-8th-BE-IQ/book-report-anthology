package com.iq.anthology.support;

public class DomainException extends RuntimeException {

    private final ErrorType type;

    public DomainException(ErrorType type, String message) {
        super(message);
        this.type = type;
    }

    public static DomainException notFound(String message) {
        return new DomainException(ErrorType.NOT_FOUND, message);
    }

    public static DomainException forbidden(String message) {
        return new DomainException(ErrorType.FORBIDDEN, message);
    }

    public static DomainException conflict(String message) {
        return new DomainException(ErrorType.CONFLICT, message);
    }

    public static DomainException rule(String message) {
        return new DomainException(ErrorType.RULE_VIOLATION, message);
    }

    public ErrorType type() {
        return type;
    }
}
