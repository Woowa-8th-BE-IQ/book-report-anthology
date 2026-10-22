package com.iq.anthology.web;


/** 화면 폼 바인딩용. 검증은 도메인이 한다. */
public final class Forms {

    private Forms() {
    }

    public static class OpenAnthology {
        private String title;
        private String bookTitle;
        private String bookAuthor;
        /** "11.30"처럼 사람이 쓴 그대로. 읽는 건 DueDates가 한다. */
        private String dueDate;
        private String nickname;
        private String realName;

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getBookTitle() { return bookTitle; }
        public void setBookTitle(String bookTitle) { this.bookTitle = bookTitle; }
        public String getBookAuthor() { return bookAuthor; }
        public void setBookAuthor(String bookAuthor) { this.bookAuthor = bookAuthor; }
        public String getDueDate() { return dueDate; }
        public void setDueDate(String dueDate) { this.dueDate = dueDate; }
        public String getNickname() { return nickname; }
        public void setNickname(String nickname) { this.nickname = nickname; }
        public String getRealName() { return realName; }
        public void setRealName(String realName) { this.realName = realName; }
    }

    public static class Join {
        private String nickname;
        private String realName;

        public String getNickname() { return nickname; }
        public void setNickname(String nickname) { this.nickname = nickname; }
        public String getRealName() { return realName; }
        public void setRealName(String realName) { this.realName = realName; }
    }

    public static class WriteEssay {
        private String title;
        private String quote;
        private String body;

        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getQuote() { return quote; }
        public void setQuote(String quote) { this.quote = quote; }
        public String getBody() { return body; }
        public void setBody(String body) { this.body = body; }
    }
}
