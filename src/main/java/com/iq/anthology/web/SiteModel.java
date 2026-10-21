package com.iq.anthology.web;

import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/** 모든 화면에 공통으로 넣는 값. 공유 미리보기(OG)의 절대 주소에 쓴다. */
@ControllerAdvice
public class SiteModel {

    @ModelAttribute("baseUrl")
    public String baseUrl() {
        return ServletUriComponentsBuilder.fromCurrentContextPath().build().toUriString();
    }
}
