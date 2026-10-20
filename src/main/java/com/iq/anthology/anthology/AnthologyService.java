package com.iq.anthology.anthology;

import com.iq.anthology.support.DomainException;
import com.iq.anthology.support.IdentifierGenerator;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnthologyService {

    private static final int CODE_ATTEMPTS = 5;

    private final AnthologyRepository anthologyRepository;
    private final IdentifierGenerator identifiers;
    private final Clock clock;

    public AnthologyService(AnthologyRepository anthologyRepository, IdentifierGenerator identifiers, Clock clock) {
        this.anthologyRepository = anthologyRepository;
        this.identifiers = identifiers;
        this.clock = clock;
    }

    @Transactional
    public Admission open(String title, String bookTitle, String bookAuthor, LocalDate dueDate,
                          String editorNickname, String editorRealName) {
        String token = identifiers.participantToken();
        Anthology anthology = Anthology.open(uniqueCode(), title, bookTitle, bookAuthor, dueDate,
                editorNickname, editorRealName, token, now());
        anthologyRepository.save(anthology);
        return new Admission(anthology.code(), token);
    }

    @Transactional
    public Admission join(String code, String nickname, String realName) {
        Anthology anthology = get(code);
        String token = identifiers.participantToken();
        Contributor newcomer = anthology.join(nickname, realName, token, now());
        anthologyRepository.addContributor(anthology.id(), newcomer);
        return new Admission(anthology.code(), token);
    }

    @Transactional
    public void introduce(String code, String token, String introduction) {
        Anthology anthology = get(code);
        anthology.introduce(requireContributor(anthology, token), introduction);
        anthologyRepository.updateIntroduction(anthology);
    }

    @Transactional(readOnly = true)
    public Anthology get(String code) {
        return anthologyRepository.findByCode(code)
                .orElseThrow(() -> DomainException.notFound("문집을 찾을 수 없어요. 초대 링크를 다시 확인해 주세요."));
    }

    @Transactional(readOnly = true)
    public Anthology getByToken(String token) {
        return anthologyRepository.findByContributorToken(token)
                .orElseThrow(() -> DomainException.notFound("개인 링크가 올바르지 않아요."));
    }

    public static Contributor requireContributor(Anthology anthology, String token) {
        return anthology.findByToken(token)
                .orElseThrow(() -> DomainException.forbidden("이 문집에 참여한 사람만 할 수 있어요."));
    }

    public LocalDate today() {
        return LocalDate.now(clock);
    }

    private String uniqueCode() {
        for (int attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
            String code = identifiers.anthologyCode();
            if (!anthologyRepository.existsByCode(code)) {
                return code;
            }
        }
        throw DomainException.conflict("문집 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock);
    }

    /** 문집에 들어온 결과: 어느 문집에, 어떤 토큰으로. */
    public record Admission(String code, String token) {
    }
}
