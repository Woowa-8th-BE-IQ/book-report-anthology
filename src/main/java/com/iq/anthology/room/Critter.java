package com.iq.anthology.room;

import com.iq.anthology.support.DomainException;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Optional;

/**
 * 꼬깃단: 덕후감 서재에 사는 하찮은 책 좋아하는 동물들. 참여자는 이 여덟 중 하나로 보인다.
 * 그림은 {@code critters/<slug>.svg}에 64×64 좌표의 조각으로 있다(바깥 svg 태그는 {@link Avatar}가 씌운다).
 * 순서는 처음 참여한 사람부터 돌아가며 받는 순서다. 저장된 값은 slug라서 순서를 바꿔도 고른 캐릭터는 그대로다.
 */
public enum Critter {

    PENGUIN("penguin", "뒤뚱", "바위뛰기펭귄", "덕후감 대표", "배송도 직접 해요", "다 엮었어요! 뒤뚱뒤뚱 가져갈게요",
            "모두의 독후감이 한 권으로 엮이면, 그 책을 끙끙 안고 한 사람씩 가져다줘요. "
                    + "노란 눈썹 때문에 화났냐는 말을 자주 듣지만 원래 이렇게 생겼어요. 사실은 엄청 신났어요."),
    DUCK("duck", "꽥이", "오리", "사내 BGM 이사", "출근하면 콧노래부터 틀어요", "여기 오면 노래가 나와요",
            "바깥은 늘 비가 오지만, 독서 모임에 오면 책 지붕 아래에서 비를 피해요. "
                    + "기분이 좋아지면 저도 모르게 콧노래가 새어 나와요."),
    HEDGEHOG("hedgehog", "따끔", "고슴도치", "프리허그 담당", "이제 안아도 안 따가워요", "예전엔 따끔했는데, 책 읽고 몽실해졌어요",
            "책을 읽다 보니 가시가 몽실몽실 부드러워졌어요. 그래도 머리에 꽂아 둔 연필 하나는 늘 세워 둬요. "
                    + "좋은 생각이 떠오르면 바로 적으려고요."),
    FROG("frog", "개굴", "개구리", "명언 낚시 팀장", "좋은 말은 놓친 적 없어요", "방금 그 말, 콕 낚았어요",
            "대화 중에 마음에 남는 한마디가 지나가면 혀를 쭉 뻗어 콕 낚아채요. "
                    + "낚은 말에는 책갈피를 꽂아 두고 두고두고 꺼내 봐요."),
    MOLE("mole", "더듬", "두더지", "주경야독 본부장", "다크서클이 사원증이에요", "낮엔 땅 파고, 밤엔 책 파요",
            "낮에는 부지런히 땅을 파고, 밤이 되면 헤드램프를 켜고 책을 파요. "
                    + "눈 밑 다크서클은 밤새 읽은 훈장이에요."),
    BOOKWORM("bookworm", "꼼지", "책벌레", "정독 연구원", "아직 1쪽이에요", "한 줄씩, 꼭꼭 씹어 먹어요",
            "좋은 문장은 한 줄씩 꼭꼭 씹어서 맛을 봐요. 그래서 아직 1쪽이에요. "
                    + "그래도 제일 맛있게 읽는 건 꼼지예요."),
    RACCOON("raccoon", "꾸벅", "너구리", "근무 중 수면 대리", "읽는 중이에요… 진짜로", "안 자요… 읽고 있어요…",
            "자꾸 꾸벅꾸벅 졸지만 실눈을 뜨고 끝까지 읽어요. 잠 깨려고 쓴 비니는… 별 효과가 없어요."),
    SNAIL("snail", "느릿", "달팽이", "인내심 전무", "기다림 하나로 임원 됐어요", "제 책… 언제 와요…?",
            "주문한 책이 오기를 목 빠지게 기다려요. 아주 느린 배송이라 오늘도 입이 삐죽 나와 있어요. "
                    + "남의 글이 열리길 기다릴 때 옆에서 같이 기다려 줘요.");

    private final String slug;
    private final String title;
    private final String species;
    private final String role;
    private final String roleNote;
    private final String tagline;
    private final String story;
    private final String art;

    Critter(String slug, String title, String species, String role, String roleNote, String tagline, String story) {
        this.slug = slug;
        this.title = title;
        this.species = species;
        this.role = role;
        this.roleNote = roleNote;
        this.tagline = tagline;
        this.story = story;
        this.art = load(slug);
    }

    private static String load(String slug) {
        try (InputStream in = Critter.class.getResourceAsStream("/critters/" + slug + ".svg")) {
            if (in == null) {
                throw new IllegalStateException("캐릭터 그림이 없어요: " + slug);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).strip();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** 고른 적 없으면 참여 순서대로 돌아가며 받는다. joinOrder는 0부터라 문집을 연 사람(0)은 뒤뚱. */
    public static Critter derived(int joinOrder) {
        Critter[] all = values();
        return all[Math.floorMod(joinOrder, all.length)];
    }

    public static Optional<Critter> find(String slug) {
        return Arrays.stream(values()).filter(critter -> critter.slug.equals(slug)).findFirst();
    }

    public static Critter of(String slug) {
        return find(slug).orElseThrow(() -> DomainException.rule("없는 캐릭터예요."));
    }

    public String slug() {
        return slug;
    }

    /** 이름(뒤뚱, 꽥이…). */
    public String title() {
        return title;
    }

    public String species() {
        return species;
    }

    /** 덕후감 서재에서 맡은 일(직책). */
    public String role() {
        return role;
    }

    /** 그 직책인 까닭. 짧고 웃기게. */
    public String roleNote() {
        return roleNote;
    }

    public String tagline() {
        return tagline;
    }

    public String story() {
        return story;
    }


    /** 바깥 svg 태그 없는 그림 조각. */
    String art() {
        return art;
    }
}
