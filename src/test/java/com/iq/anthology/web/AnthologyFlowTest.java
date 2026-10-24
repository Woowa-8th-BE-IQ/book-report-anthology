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
    void 첫_화면_탭_이름은_서비스_이름이_먼저다() throws Exception {
        mvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("<title>덕후감 | 책 덕후들의 독후감</title>")));
    }

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

        // 자동 저장은 JSON으로 답한다
        String saved = mvc.perform(post("/anthologies/{code}/essay/autosave", code).cookie(potato)
                        .param("title", "가제").param("quote", "").param("body", "첫 줄"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(saved).contains("\"saved\":true");
        mvc.perform(post("/anthologies/{code}/essay/autosave", code)
                        .param("title", "가제").param("body", "첫 줄"))
                .andExpect(status().isForbidden());

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

        // 감자가 맛보기를 허락하면 공개 소개 페이지에 그 한 편만 보인다
        String potatoEssay = idOf(mvc.perform(get("/anthologies/{code}/book", code).cookie(potato))
                .andReturn().getResponse().getContentAsString(), "/sample");
        mvc.perform(post("/anthologies/{code}/essays/{id}/sample", code, potatoEssay).cookie(potato)
                        .param("allowed", "true"))
                .andExpect(status().is3xxRedirection());
        assertThat(mvc.perform(get("/anthologies/{code}/about", code)).andReturn().getResponse()
                .getContentAsString()).contains("맛보기 한 편");
        mvc.perform(post("/anthologies/{code}/essays/{id}/sample", code, potatoEssay).cookie(potato)
                .param("allowed", "false"));

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

        // 인쇄용 PDF
        byte[] pdf = mvc.perform(get("/anthologies/{code}/book.pdf", code).cookie(editor))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "application/pdf"))
                .andReturn().getResponse().getContentAsByteArray();
        assertThat(new String(pdf, 0, 5, java.nio.charset.StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    @Test
    void 엮은이는_참여자의_링크를_다시_만들고_내보낼_수_있다() throws Exception {
        MvcResult opened = mvc.perform(post("/anthologies")
                        .param("title", "두 번째 문집").param("bookTitle", "객체지향의 사실과 오해")
                        .param("nickname", "레오"))
                .andReturn();
        String location = opened.getResponse().getRedirectedUrl();
        String code = location.substring(location.lastIndexOf('/') + 1);
        Cookie editor = opened.getResponse().getCookie("ab_" + code);
        Cookie potato = mvc.perform(post("/anthologies/{code}/contributors", code).param("nickname", "감자"))
                .andReturn().getResponse().getCookie("ab_" + code);

        String editorView = mvc.perform(get("/anthologies/{code}", code).cookie(editor))
                .andReturn().getResponse().getContentAsString();
        String potatoId = idOf(editorView, "/reissue");

        mvc.perform(post("/anthologies/{code}/contributors/{id}/reissue", code, potatoId).cookie(editor))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getFlashMap().get("reissuedUrl")).asString().contains("/me/"));
        // 옛 쿠키(옛 토큰)로는 더 이상 들어오지 못한다
        mvc.perform(post("/anthologies/{code}/essay", code).cookie(potato)
                        .param("title", "제목").param("body", "본문").param("action", "save"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/anthologies/{code}/contributors/{id}/remove", code, potatoId).cookie(editor))
                .andExpect(status().is3xxRedirection());
        assertThat(mvc.perform(get("/anthologies/{code}", code).cookie(editor)).andReturn().getResponse()
                .getContentAsString()).doesNotContain("/contributors/" + potatoId + "/");
    }

    @Test
    void 참여자는_모임방에서_이야기한다() throws Exception {
        MvcResult opened = mvc.perform(post("/anthologies")
                        .param("title", "모임방 문집").param("bookTitle", "데미안").param("nickname", "레오"))
                .andReturn();
        String location = opened.getResponse().getRedirectedUrl();
        String code = location.substring(location.lastIndexOf('/') + 1);
        Cookie editor = opened.getResponse().getCookie("ab_" + code);

        // 참여자가 아니면 참여 폼으로 보낸다
        mvc.perform(get("/anthologies/{code}/room", code))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl())
                        .isEqualTo("/anthologies/" + code));
        mvc.perform(post("/anthologies/{code}/room/messages", code).header("X-Room", "1").param("body", "몰래"))
                .andExpect(status().isForbidden());

        // 스크립트로 보내면 JSON, 폼으로 보내면 방으로 돌아온다
        mvc.perform(post("/anthologies/{code}/room/messages", code).cookie(editor).header("X-Room", "1")
                        .param("body", "어서 오세요 <b>"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"body\":\"어서 오세요 <b>\"")));
        mvc.perform(post("/anthologies/{code}/room/messages", code).cookie(editor).param("body", "두 번째 말"))
                .andExpect(status().is3xxRedirection());
        mvc.perform(post("/anthologies/{code}/room/messages", code).cookie(editor).header("X-Room", "1")
                        .param("body", " "))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/anthologies/{code}/room/typing", code).cookie(editor))
                .andExpect(status().isNoContent());
        // 부른 사람(@닉네임)은 mentions로, 읽은 자리는 read로
        mvc.perform(post("/anthologies/{code}/room/messages", code).cookie(editor).header("X-Room", "1")
                        .param("body", "@모두 반가워요"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"mentions\":[]")));
        mvc.perform(post("/anthologies/{code}/room/read", code).cookie(editor).param("upTo", "1"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/anthologies/{code}/room/read", code).param("upTo", "1"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/anthologies/{code}/room/position", code).cookie(editor).param("x", "0.3").param("y", "0.8"))
                .andExpect(status().isNoContent());
        mvc.perform(post("/anthologies/{code}/room/position", code).param("x", "0.3").param("y", "0.8"))
                .andExpect(status().isForbidden());

        String page = mvc.perform(get("/anthologies/{code}/room", code).cookie(editor))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(page).contains("어서 오세요 &lt;b&gt;", "두 번째 말", "avatar-svg", "data-seat-x=\"0.5\"").doesNotContain("어서 오세요 <b>");

        // 데스크톱 펫: 개인 링크에 ?to=pet을 붙이면 펫 화면으로 간다
        String token = editor.getValue();
        mvc.perform(get("/me/{token}", token).param("to", "pet"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl())
                        .isEqualTo("/pet?focus=" + code));
        mvc.perform(get("/anthologies/{code}/pet", code))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl())
                        .isEqualTo("/pet?focus=" + code));
        // 책갈피: 남기고, 모음에서 보고, 이전 대화를 불러온다
        String said = mvc.perform(post("/anthologies/{code}/room/messages", code).cookie(editor).header("X-Room", "1")
                        .param("body", "걷는 장면이 오래 남았어요"))
                .andReturn().getResponse().getContentAsString();
        String saidId = said.replaceAll(".*\"id\":(\\d+).*", "$1");
        mvc.perform(post("/anthologies/{code}/room/messages/{id}/bookmark", code, saidId).cookie(editor))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"marked\":true")));
        mvc.perform(post("/anthologies/{code}/room/messages/{id}/bookmark", code, saidId))
                .andExpect(status().isForbidden());
        assertThat(mvc.perform(get("/anthologies/{code}/room/bookmarks", code).cookie(editor)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).contains("책갈피 모음", "걷는 장면이 오래 남았어요");
        mvc.perform(get("/anthologies/{code}/room/messages", code).cookie(editor).param("before", saidId)
                        .accept(org.springframework.http.MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"more\":false")));
        mvc.perform(post("/anthologies/{code}/room/chat-in-book", code).cookie(editor).param("include", "false"))
                .andExpect(status().is3xxRedirection());

        // 대화 속 바깥 링크는 안내 화면을 거쳐 사람이 눌러서 간다(http·https만)
        assertThat(mvc.perform(get("/out").param("url", "https://example.com/a?b=1")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString())
                .contains("바깥 사이트로 가요", "example.com", "href=\"https://example.com/a?b=1\"");
        mvc.perform(get("/out").param("url", "javascript:alert(1)")).andExpect(status().isUnprocessableEntity());
        assertThat(mvc.perform(get("/pet/build")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString()).isEqualTo(com.iq.anthology.room.RoomHub.BUILD);
        assertThat(mvc.perform(get("/pet").cookie(editor))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString())
                .contains("pet-avatar", "두 번째 말", "data-face=", "모임방 문집", "캐릭터 바꾸기");
        assertThat(mvc.perform(get("/pet"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString())
                .contains("연결된 문집이 없어요");

        // 펫 하나에 문집 여러 개: 다른 문집의 출입증도 있으면 탭이 둘
        MvcResult second = mvc.perform(post("/anthologies")
                        .param("title", "두 번째 펫 문집").param("bookTitle", "변신").param("nickname", "레오"))
                .andReturn();
        String secondLocation = second.getResponse().getRedirectedUrl();
        String secondCode = secondLocation.substring(secondLocation.lastIndexOf('/') + 1);
        Cookie secondPass = second.getResponse().getCookie("ab_" + secondCode);
        String both = mvc.perform(get("/pet").param("focus", secondCode).cookie(editor, secondPass))
                .andReturn().getResponse().getContentAsString();
        assertThat(both).contains("모임방 문집", "두 번째 펫 문집", "data-selected=\"" + secondCode + "\"");
        // 엉뚱한 출입증은 무시하고 지운다
        String stale = mvc.perform(get("/pet").cookie(editor, new Cookie("ab_nothing", "wrong")))
                .andExpect(header().stringValues("Set-Cookie", org.hamcrest.Matchers.hasItem(
                        org.hamcrest.Matchers.startsWith("ab_nothing=;"))))
                .andReturn().getResponse().getContentAsString();
        assertThat(stale).contains("모임방 문집");
        mvc.perform(post("/pet/leave").param("code", secondCode).cookie(secondPass))
                .andExpect(status().isNoContent())
                .andExpect(header().string("Set-Cookie", org.hamcrest.Matchers.startsWith("ab_" + secondCode + "=;")));

        // 펫에서 바로 문집을 열고, 초대 링크로 참여한다
        MvcResult petOpened = mvc.perform(post("/pet/anthologies")
                        .param("title", "펫에서 연 문집").param("bookTitle", "이방인").param("nickname", "레오"))
                .andExpect(status().isOk())
                .andReturn();
        String petBody = petOpened.getResponse().getContentAsString();
        java.util.regex.Matcher petCode = java.util.regex.Pattern.compile("\"code\":\"([A-Za-z0-9]+)\"").matcher(petBody);
        assertThat(petCode.find()).isTrue();
        assertThat(petBody).contains("\"inviteUrl\":\"http://localhost/anthologies/" + petCode.group(1) + "\"");
        assertThat(petOpened.getResponse().getCookie("ab_" + petCode.group(1))).isNotNull();
        mvc.perform(post("/pet/anthologies").param("title", "제목만"))
                .andExpect(status().isUnprocessableEntity());
        Cookie joined = mvc.perform(post("/pet/join")
                        .param("invite", "http://localhost/anthologies/" + petCode.group(1) + "/room")
                        .param("nickname", "펫손님"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getCookie("ab_" + petCode.group(1));
        assertThat(joined).isNotNull();
        mvc.perform(post("/pet/join").cookie(joined).param("invite", petCode.group(1)).param("nickname", "또"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"already\":true")));
        mvc.perform(post("/pet/join").param("invite", "hello world").param("nickname", "감자"))
                .andExpect(status().isUnprocessableEntity());

        // 펫 안에서 캐릭터 바꾸기는 JSON으로 답한다
        mvc.perform(post("/anthologies/{code}/avatar", code).cookie(editor).header("X-Room", "1")
                        .param("critter", "frog"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("\"critter\":\"frog\"")));
        mvc.perform(post("/anthologies/{code}/avatar", code).cookie(editor).header("X-Room", "1")
                        .param("critter", "zzz"))
                .andExpect(status().isUnprocessableEntity());

        // 캐릭터 고르기: 그림, 고르기 화면, 저장하면 모임방에 새 얼굴
        mvc.perform(get("/avatars/v4/{slug}.svg", "snail"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.startsWith("image/svg+xml")));
        mvc.perform(get("/avatars/v4/{slug}.svg", "nope")).andExpect(status().isUnprocessableEntity());
        mvc.perform(get("/avatars/v3/{style}.svg", "c8b4e2m3x5k1")).andExpect(status().isOk()); // 예전 주소도 열린다
        assertThat(mvc.perform(get("/anthologies/{code}/avatar", code).cookie(editor))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .contains("내 캐릭터", "꽥이", "처음 받은 친구", "/avatars/v4/frog.svg");
        mvc.perform(post("/anthologies/{code}/avatar", code).cookie(editor)
                        .param("critter", "snail").param("back", "room"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getFlashMap().get("notice")).asString().contains("느릿"))
                .andExpect(result -> assertThat(result.getResponse().getRedirectedUrl())
                        .isEqualTo("/anthologies/" + code + "/room"));
        assertThat(mvc.perform(get("/anthologies/{code}/room", code).cookie(editor)).andReturn().getResponse()
                .getContentAsString()).contains(com.iq.anthology.room.Avatar.svg(com.iq.anthology.room.Critter.SNAIL));
        mvc.perform(post("/anthologies/{code}/avatar", code).cookie(editor).param("critter", "unicorn"))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getFlashMap().get("error")).asString().contains("없는 캐릭터"));
        // 비워서 보내면 처음 받은 친구로 돌아간다
        mvc.perform(post("/anthologies/{code}/avatar", code).cookie(editor).param("critter", ""))
                .andExpect(status().is3xxRedirection())
                .andExpect(result -> assertThat(result.getFlashMap().get("notice")).asString().contains("뒤뚱이에요"));

        // 책 동물 소개와 펫 설치 안내는 누구나 본다
        assertThat(mvc.perform(get("/characters")).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString())
                .contains("하찮은 책 동물들", "뒤뚱", "느릿", "바위뛰기펭귄", "/pet/install.sh", "/pet/install.ps1")
                .doesNotContain("이름은 옛날 그대로");

        // 설치 스크립트를 내려준다
        assertThat(mvc.perform(get("/pet/install.sh")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).contains("BookReportPet.app");
        mvc.perform(get("/pet/install.ps1")).andExpect(status().isOk());

        // 문집 화면의 참여자 목록에 마지막 접속이 보인다
        Cookie guest = mvc.perform(post("/anthologies/{code}/contributors", code).param("nickname", "손님"))
                .andReturn().getResponse().getCookie("ab_" + code);
        assertThat(mvc.perform(get("/anthologies/{code}", code).cookie(guest))
                .andReturn().getResponse().getContentAsString())
                .contains("class=\"seen", "/pet/install.sh | bash", "내 개인 링크");
        assertThat(mvc.perform(get("/anthologies/{code}", code)).andReturn().getResponse().getContentAsString())
                .doesNotContain("pet-install-mac"); // 참여자가 아니면 개인 링크·펫 안내가 없다

        // 실시간 연결은 이벤트 스트림으로 열린다
        mvc.perform(get("/anthologies/{code}/room/stream", code).cookie(editor))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.request().asyncStarted())
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.startsWith("text/event-stream")));
    }

    /** 응답 HTML에서 "/{id}{suffix}" 꼴 링크의 id를 꺼낸다. */
    private static String idOf(String html, String suffix) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("/(\\d+)" + java.util.regex.Pattern.quote(suffix))
                .matcher(html);
        assertThat(matcher.find()).as(suffix + " 링크").isTrue();
        return matcher.group(1);
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
