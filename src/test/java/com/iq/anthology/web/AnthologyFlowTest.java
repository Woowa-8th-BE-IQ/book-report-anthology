package com.iq.anthology.web;

import static com.iq.anthology.Fixtures.LONG_BODY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** 문집 열기 → 참여 → 쓰기·제출 → 잠금 해제 → 마감 → EPUB까지 화면 흐름 전체. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:flow;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE")
@AutoConfigureMockMvc
class AnthologyFlowTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void 독후감을_모아_한_권으로_엮는다() throws Exception {
        // 엮은이가 문집을 연다
        MvcResult opened = mvc.perform(post("/anthologies")
                        .param("title", "일단 나부터 읽어 봅니다")
                        .param("bookTitle", "리팩터링")
                        .param("bookAuthor", "마틴 파울러")
                        .param("nickname", "레오")
                        .param("realName", "한동희"))
                .andExpect(status().is3xxRedirection())
                .andReturn();
        String location = opened.getResponse().getRedirectedUrl();
        String code = location.substring(location.lastIndexOf('/') + 1);
        Cookie editor = opened.getResponse().getCookie("ab_" + code);
        assertThat(editor).isNotNull();
        assertThat(editor.isHttpOnly()).isTrue();

        // 감자가 초대 링크로 들어온다
        Cookie potato = mvc.perform(post("/anthologies/{code}/contributors", code).param("nickname", "감자"))
                .andExpect(status().is3xxRedirection())
                .andReturn().getResponse().getCookie("ab_" + code);

        // 엮은이가 제출한다
        mvc.perform(post("/anthologies/{code}/essay", code).cookie(editor)
                        .param("title", "테스트가 나를 붙잡아 준 날").param("body", LONG_BODY).param("action", "submit"))
                .andExpect(status().is3xxRedirection());

        // 감자는 아직 제출 전: 책장에 제목은 보이지만 잠겨 있다
        String locked = mvc.perform(get("/anthologies/{code}", code).cookie(potato))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(locked).contains("테스트가 나를 붙잡아 준 날").contains("제출하면 열려요");

        // 엮은이 화면의 책장 링크에서 엮은이 글의 id를 얻는다
        String editorView = mvc.perform(get("/anthologies/{code}", code).cookie(editor))
                .andReturn().getResponse().getContentAsString();
        java.util.regex.Matcher link = java.util.regex.Pattern.compile("/essays/(\\d+)").matcher(editorView);
        assertThat(link.find()).isTrue();
        String editorEssay = link.group(1);

        // 감자가 초안만 저장한 상태로 엮은이 글을 열면 403
        mvc.perform(post("/anthologies/{code}/essay", code).cookie(potato)
                .param("title", "코드보다 나를 먼저").param("body", "아직").param("action", "save"));
        mvc.perform(get("/anthologies/{code}/essays/{id}", code, editorEssay).cookie(potato))
                .andExpect(status().isForbidden());

        // 감자가 제출하면 열린다
        mvc.perform(post("/anthologies/{code}/essay", code).cookie(potato)
                        .param("title", "코드보다 나를 먼저").param("body", LONG_BODY).param("action", "submit"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(get("/anthologies/{code}/essays/{id}", code, editorEssay).cookie(potato))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("레오(한동희)")));

        // 감자는 마감할 수 없고, 엮은이는 할 수 있다
        mvc.perform(post("/anthologies/{code}/close", code).cookie(potato))
                .andExpect(status().isForbidden());
        mvc.perform(post("/anthologies/{code}/close", code).cookie(editor))
                .andExpect(status().is3xxRedirection());

        // 공개 소개 페이지에는 목차만 있고 본문은 없다
        String about = mvc.perform(get("/anthologies/{code}/about", code))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(about).contains("감자", "코드보다 나를 먼저").doesNotContain(LONG_BODY.strip());

        // 함께 쓴 사람은 EPUB을 받는다. 남은 못 받는다.
        mvc.perform(get("/anthologies/{code}/book.epub", code).cookie(potato))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/epub+zip"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("attachment")));
        mvc.perform(get("/anthologies/{code}/book.epub", code))
                .andExpect(status().isForbidden());
    }

    @Test
    void 규칙을_어기면_입력값을_들고_폼으로_돌아간다() throws Exception {
        mvc.perform(post("/anthologies").param("title", "제목").param("bookTitle", "").param("nickname", "레오"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl()).isEqualTo("/anthologies/new"))
                .andExpect(result -> assertThat(result.getFlashMap().get("error")).asString().contains("책 제목"));
    }

    @Test
    void 없는_문집은_404다() throws Exception {
        mvc.perform(get("/anthologies/{code}", "nothing")).andExpect(status().isNotFound());
    }
}
