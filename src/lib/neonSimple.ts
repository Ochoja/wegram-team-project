// Simple Neon Postgres Service (No Prisma)
import { neon } from '@neondatabase/serverless';

// Get database connection from environment variable
// Handle both Vite (VITE_) and Node.js environment variables
const DATABASE_URL = import.meta.env?.DATABASE_URL || 
                     import.meta.env?.VITE_DATABASE_URL || 
                     process.env.DATABASE_URL;

// For frontend, we'll use API endpoints instead of direct database access
const isServerSide = typeof window === 'undefined';
const sql = (DATABASE_URL && isServerSide) ? neon(DATABASE_URL) : null;

if (!DATABASE_URL && isServerSide) {
  console.warn('⚠️ No DATABASE_URL found. Database features will be disabled.');
}

export interface Profile {
  id: string;
  username: string;
  email?: string;
  avatar_url?: string;
  bio?: string;
  verified: boolean;
  followers_count: number;
  following_count: number;
  posts_count: number;
  twitter_id?: string;
  twitter_username?: string;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  user_id: string;
  content: string;
  image_url?: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  updated_at: string;
  // Joined data
  username?: string;
  avatar_url?: string;
  verified?: boolean;
}

export class NeonSimpleService {
  
  // 🚀 Create user from Twitter data
  async createUserFromTwitter(twitterData: any): Promise<Profile> {
    if (!sql) {
      // Fallback: create user object without database for now
      const fallbackUser: Profile = {
        id: `demo_${Date.now()}`,
        username: `@${twitterData.username}`,
        avatar_url: twitterData.profile_image_url || null,
        bio: twitterData.description || `Twitter user ${twitterData.name}`,
        verified: twitterData.verified || false,
        twitter_id: twitterData.id,
        twitter_username: twitterData.username,
        followers_count: twitterData.followers_count || 0,
        following_count: twitterData.following_count || 0,
        posts_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return fallbackUser;
    }

    const result = await sql`
      INSERT INTO profiles (
        username, avatar_url, bio, verified, 
        twitter_id, twitter_username,
        followers_count, following_count
      ) VALUES (
        ${`@${twitterData.username}`},
        ${twitterData.profile_image_url || null},
        ${twitterData.description || `Twitter user ${twitterData.name}`},
        ${twitterData.verified || false},
        ${twitterData.id},
        ${twitterData.username},
        ${twitterData.followers_count || 0},
        ${twitterData.following_count || 0}
      )
      RETURNING *
    `;
    
    return result[0] as Profile;
  }

  // 🚀 Get user by Twitter ID
  async getUserByTwitterId(twitterId: string): Promise<Profile | null> {
    if (!sql) {
      return null;
    }

    const result = await sql`
      SELECT * FROM profiles WHERE twitter_id = ${twitterId}
    `;
    
    return result[0] as Profile || null;
  }


  // 🚀 Get user feed - Single fast query
  async getFeedPosts(userId: string, limit = 20): Promise<Post[]> {
    const result = await sql`
      SELECT 
        p.*,
        pr.username,
        pr.avatar_url,
        pr.verified
      FROM posts p
      JOIN profiles pr ON p.user_id = pr.id
      JOIN follows f ON p.user_id = f.following_id
      WHERE f.follower_id = ${userId}
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `;
    
    return result as Post[];
  }

  // 🚀 Create post
  async createPost(userId: string, content: string, imageUrl?: string): Promise<Post> {
    const result = await sql`
      INSERT INTO posts (user_id, content, image_url)
      VALUES (${userId}, ${content}, ${imageUrl || null})
      RETURNING *
    `;
    
    return result[0] as Post;
  }

  // 🚀 Like post
  async likePost(userId: string, postId: string): Promise<boolean> {
    try {
      // Insert like (ignore if already exists)
      await sql`
        INSERT INTO likes (user_id, post_id)
        VALUES (${userId}, ${postId})
        ON CONFLICT (user_id, post_id) DO NOTHING
      `;
      
      // Update likes count
      await sql`
        UPDATE posts 
        SET likes_count = (
          SELECT COUNT(*) FROM likes WHERE post_id = ${postId}
        )
        WHERE id = ${postId}
      `;
      
      return true;
    } catch (error) {
      console.error('Like error:', error);
      return false;
    }
  }

  // 🚀 Follow user
  async followUser(followerId: string, followingId: string): Promise<boolean> {
    try {
      // Insert follow relationship
      await sql`
        INSERT INTO follows (follower_id, following_id)
        VALUES (${followerId}, ${followingId})
        ON CONFLICT (follower_id, following_id) DO NOTHING
      `;
      
      return true;
    } catch (error) {
      console.error('Follow error:', error);
      return false;
    }
  }

  // 🚀 Get trending posts
  async getTrendingPosts(limit = 20): Promise<Post[]> {
    const result = await sql`
      SELECT 
        p.*,
        pr.username,
        pr.avatar_url,
        pr.verified
      FROM posts p
      JOIN profiles pr ON p.user_id = pr.id
      WHERE p.created_at > NOW() - INTERVAL '24 hours'
      ORDER BY p.likes_count DESC, p.created_at DESC
      LIMIT ${limit}
    `;
    
    return result as Post[];
  }
}

export const neonSimple = new NeonSimpleService();
