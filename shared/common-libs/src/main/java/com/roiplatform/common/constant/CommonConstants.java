package com.roiplatform.common.constant;

/**
 * ROIPLATFORM 공통 상수 정의
 * 
 * 전체 시스템에서 사용되는 공통 상수들을 정의합니다.
 */
public final class CommonConstants {

    private CommonConstants() {
        // 유틸리티 클래스는 인스턴스 생성 방지
    }

    // HTTP 헤더
    public static final String HEADER_TENANT_ID = "X-Tenant-Id";
    public static final String HEADER_USER_ID = "X-User-Id";
    public static final String HEADER_AUTHORIZATION = "Authorization";
    public static final String HEADER_BEARER_PREFIX = "Bearer ";

    // JWT 클레임
    public static final String JWT_CLAIM_USER_ID = "userId";
    public static final String JWT_CLAIM_TENANT_ID = "tenantId";
    public static final String JWT_CLAIM_ROLES = "roles";
    public static final String JWT_CLAIM_PERMISSIONS = "permissions";

    // 응답 코드
    public static final class ResponseCode {
        public static final String SUCCESS = "SUCCESS";
        public static final String VALIDATION_ERROR = "VALIDATION_ERROR";
        public static final String UNAUTHORIZED = "UNAUTHORIZED";
        public static final String FORBIDDEN = "FORBIDDEN";
        public static final String NOT_FOUND = "NOT_FOUND";
        public static final String INTERNAL_ERROR = "INTERNAL_ERROR";
        public static final String TENANT_NOT_FOUND = "TENANT_NOT_FOUND";
        public static final String USER_NOT_FOUND = "USER_NOT_FOUND";
        public static final String INVALID_CREDENTIALS = "INVALID_CREDENTIALS";
        public static final String ACCOUNT_LOCKED = "ACCOUNT_LOCKED";
    }

    // 사용자 상태
    public static final class UserStatus {
        public static final String ACTIVE = "ACTIVE";
        public static final String INACTIVE = "INACTIVE";
        public static final String LOCKED = "LOCKED";
        public static final String PENDING_VERIFICATION = "PENDING_VERIFICATION";
    }

    // 테넌트 상태
    public static final class TenantStatus {
        public static final String ACTIVE = "ACTIVE";
        public static final String INACTIVE = "INACTIVE";
        public static final String SUSPENDED = "SUSPENDED";
    }

    // 역할 타입
    public static final class RoleType {
        public static final String SYSTEM = "SYSTEM";
        public static final String TENANT_ADMIN = "TENANT_ADMIN";
        public static final String CUSTOM = "CUSTOM";
    }

    // 기본 페이징
    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 100;
    public static final String DEFAULT_SORT_DIRECTION = "ASC";

    // 보안 설정
    public static final int MAX_LOGIN_ATTEMPTS = 5;
    public static final int ACCOUNT_LOCK_DURATION_MINUTES = 30;
    public static final int PASSWORD_MIN_LENGTH = 8;
    public static final int PASSWORD_MAX_LENGTH = 128;

    // 날짜 포맷
    public static final String DATE_FORMAT = "yyyy-MM-dd";
    public static final String DATETIME_FORMAT = "yyyy-MM-dd HH:mm:ss";
    public static final String ISO_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX";
}