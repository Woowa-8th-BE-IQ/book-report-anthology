package com.iq.anthology.web;

import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** 모든 화면에 공통으로 넣는 값. 공유 미리보기(OG)의 절대 주소, 캐릭터 그림의 흔들림 필터. */
@ControllerAdvice
public class SiteModel {

    @ModelAttribute("baseUrl")
    public String baseUrl() {
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }

    /** 캐릭터 그림이 함께 쓰는 손그림 필터 정의. 화면 맨 위에 한 번 둔다. */
    @ModelAttribute("wobble")
    public String wobble() {
        return com.iq.anthology.room.Avatar.WOBBLE;
    }
}
