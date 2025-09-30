package com.roiplatform.auth;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/**
 * ROIPLATFORM 인증/인가 서비스 메인 애플리케이션
 * 
 * 기능:
 * - JWT 기반 인증/인가
 * - 멀티테넌트 사용자 관리
 * - 역할 기반 접근 제어 (RBAC)
 * - 보안 감사 및 로깅
 */
@SpringBootApplication
@EnableJpaRepositories
@EntityScan
@EnableTransactionManagement
public class AuthServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(AuthServiceApplication.class, args);
    }
}