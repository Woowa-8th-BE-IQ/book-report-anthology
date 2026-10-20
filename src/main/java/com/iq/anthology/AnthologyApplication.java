package com.iq.anthology;

import com.iq.anthology.support.IdentifierGenerator;
import com.iq.anthology.support.SecureIdentifierGenerator;
import java.time.Clock;
import java.time.ZoneId;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class AnthologyApplication {

    public static void main(String[] args) {
        SpringApplication.run(AnthologyApplication.class, args);
    }

    @Bean
    Clock clock(@Value("${anthology.time-zone}") String timeZone) {
        return Clock.system(ZoneId.of(timeZone));
    }

    @Bean
    IdentifierGenerator identifierGenerator() {
        return new SecureIdentifierGenerator();
    }
}
