import { z } from "zod";
import type { KVNamespace } from '@cloudflare/workers-types';

// Constants for rate limiting and blocking
const RATE_LIMIT_WINDOW = 60; // 1 minute in seconds
const MAX_REQUESTS_PER_WINDOW = 20;
const BLOCK_DURATION = 3600; // 1 hour in seconds
const MAX_FAILED_ATTEMPTS = 20;

// Types for KV storage
interface RateLimitData {
    count: number;
    windowStart: number;
}

interface BlockData {
    blockedUntil: number;
    reason: string;
}

// Helper function to get client IP
export function getClientIP(request: Request): string {
    return request.headers.get('CF-Connecting-IP') || 
           request.headers.get('X-Forwarded-For') || 
           'unknown';
}

// Rate limiting middleware
export async function checkRateLimit(
    request: Request,
    env: { RATE_LIMIT_KV: KVNamespace }
): Promise<{ isRateLimited: boolean; retryAfter: number | null }> {
    const ip = getClientIP(request);
    const key = `rate_limit:${ip}`;
    
    // Get current rate limit data
    const rateLimitDataStr = await env.RATE_LIMIT_KV.get(key);
    const rateLimitData = rateLimitDataStr ? JSON.parse(rateLimitDataStr) as RateLimitData : null;
    const now = Math.floor(Date.now() / 1000);
    
    if (!rateLimitData || now - rateLimitData.windowStart >= RATE_LIMIT_WINDOW) {
        // Start new window
        await env.RATE_LIMIT_KV.put(key, JSON.stringify({
            count: 1,
            windowStart: now
        }));
        return { isRateLimited: false, retryAfter: null };
    }
    
    if (rateLimitData.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfter = rateLimitData.windowStart + RATE_LIMIT_WINDOW - now;
        return { isRateLimited: true, retryAfter };
    }
    
    // Increment count
    await env.RATE_LIMIT_KV.put(key, JSON.stringify({
        count: rateLimitData.count + 1,
        windowStart: rateLimitData.windowStart
    }));
    
    return { isRateLimited: false, retryAfter: null };
}

// IP blocking middleware
export async function checkIPBlock(
    request: Request,
    env: { IP_BLOCK_KV: KVNamespace }
): Promise<{ isBlocked: boolean; blockReason: string | null }> {
    const ip = getClientIP(request);
    const key = `block:${ip}`;
    
    const blockDataStr = await env.IP_BLOCK_KV.get(key);
    const blockData = blockDataStr ? JSON.parse(blockDataStr) as BlockData : null;
    const now = Math.floor(Date.now() / 1000);
    
    if (blockData && blockData.blockedUntil > now) {
        return { isBlocked: true, blockReason: blockData.reason };
    }
    
    return { isBlocked: false, blockReason: null };
}

// Track failed token attempts
export async function trackFailedAttempt(
    request: Request,
    env: { IP_BLOCK_KV: KVNamespace }
): Promise<void> {
    const ip = getClientIP(request);
    const key = `failed_attempts:${ip}`;
    
    const failedAttemptsStr = await env.IP_BLOCK_KV.get(key);
    const failedAttempts = failedAttemptsStr ? JSON.parse(failedAttemptsStr) as number : 0;
    const newAttempts = failedAttempts + 1;
    
    await env.IP_BLOCK_KV.put(key, JSON.stringify(newAttempts));
    
    // If max attempts reached, block the IP
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const blockKey = `block:${ip}`;
        const now = Math.floor(Date.now() / 1000);
        
        await env.IP_BLOCK_KV.put(blockKey, JSON.stringify({
            blockedUntil: now + BLOCK_DURATION,
            reason: 'Too many failed token attempts'
        }));
    }
}

// Reset failed attempts on successful authentication
export async function resetFailedAttempts(
    request: Request,
    env: { IP_BLOCK_KV: KVNamespace }
): Promise<void> {
    const ip = getClientIP(request);
    const key = `failed_attempts:${ip}`;
    await env.IP_BLOCK_KV.delete(key);
}

// Create error response for rate limited or blocked requests
export function createSecurityErrorResponse(
    isRateLimited: boolean,
    isBlocked: boolean,
    retryAfter: number | null,
    blockReason: string | null
): Response {
    if (isBlocked) {
        return new Response(
            JSON.stringify({
                error: 'IP blocked',
                reason: blockReason,
                retryAfter: BLOCK_DURATION
            }),
            {
                status: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': BLOCK_DURATION.toString()
                }
            }
        );
    }
    
    if (isRateLimited) {
        return new Response(
            JSON.stringify({
                error: 'Rate limit exceeded',
                retryAfter
            }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': retryAfter?.toString() || '60'
                }
            }
        );
    }
    
    return new Response(
        JSON.stringify({ error: 'Unknown security error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
} 