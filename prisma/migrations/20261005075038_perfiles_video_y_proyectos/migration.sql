-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "profile_id" TEXT,
    "video_profile_id" TEXT,
    "project_id" TEXT,
    "title" TEXT NOT NULL DEFAULT 'Nueva conversación',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL DEFAULT '',
    "show_reasoning" BOOLEAN NOT NULL DEFAULT false,
    "reasoning_effort" TEXT NOT NULL DEFAULT 'provider-default',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_video_profile_id_fkey" FOREIGN KEY ("video_profile_id") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Conversation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Conversation" ("created_at", "id", "model", "profile_id", "provider", "reasoning_effort", "show_reasoning", "title", "updated_at", "user_id") SELECT "created_at", "id", "model", "profile_id", "provider", "reasoning_effort", "show_reasoning", "title", "updated_at", "user_id" FROM "Conversation";
DROP TABLE "Conversation";
ALTER TABLE "new_Conversation" RENAME TO "Conversation";
CREATE INDEX "Conversation_user_id_updated_at_idx" ON "Conversation"("user_id", "updated_at");
CREATE INDEX "Conversation_project_id_updated_at_idx" ON "Conversation"("project_id", "updated_at");
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'script',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "script_instructions" TEXT NOT NULL DEFAULT '',
    "theme_instructions" TEXT NOT NULL DEFAULT '',
    "image_prompt_instructions" TEXT NOT NULL DEFAULT '',
    "video_prompt_instructions" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("created_at", "description", "id", "image_prompt_instructions", "name", "script_instructions", "theme_instructions", "updated_at", "user_id") SELECT "created_at", "description", "id", "image_prompt_instructions", "name", "script_instructions", "theme_instructions", "updated_at", "user_id" FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE INDEX "Profile_user_id_type_name_idx" ON "Profile"("user_id", "type", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Project_user_id_idx" ON "Project"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_user_id_name_key" ON "Project"("user_id", "name");
