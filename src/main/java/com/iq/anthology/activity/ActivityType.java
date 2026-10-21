package com.iq.anthology.activity;

/** 퍼널을 재기 위한 행동. 들어옴 → 써 봄 → 제출 → 남의 글 읽음 → 내려받음. */
public enum ActivityType {
    JOINED,
    FIRST_SAVED,
    SUBMITTED,
    READ_OTHERS,
    EPUB_DOWNLOADED,
    PDF_DOWNLOADED,
    ABOUT_VIEWED
}
