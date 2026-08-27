-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('ASSOCIATION', 'INHERITANCE', 'COMPOSITION', 'AGGREGATION', 'DEPENDENCY', 'REALIZATION');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATE_CLASS', 'UPDATE_CLASS', 'DELETE_CLASS', 'CREATE_ATTRIBUTE', 'UPDATE_ATTRIBUTE', 'DELETE_ATTRIBUTE', 'CREATE_METHOD', 'UPDATE_METHOD', 'DELETE_METHOD', 'CREATE_RELATION', 'UPDATE_RELATION', 'DELETE_RELATION', 'AI_GENERATION', 'AI_IMAGE_ANALYSIS');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('SPRING_BOOT', 'FLUTTER', 'NODE_EXPRESS', 'DJANGO', 'LARAVEL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_collaborators" (
    "id" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "workspace_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagrams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "diagrams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uml_classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" JSONB NOT NULL DEFAULT '{"x": 0, "y": 0}',
    "diagramId" TEXT NOT NULL,

    CONSTRAINT "uml_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uml_attributes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "multiplicity" TEXT,
    "stereotype" TEXT,
    "nullable" BOOLEAN NOT NULL DEFAULT true,
    "unique" BOOLEAN NOT NULL DEFAULT false,
    "classId" TEXT NOT NULL,

    CONSTRAINT "uml_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uml_methods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "returnType" TEXT NOT NULL DEFAULT 'void',
    "parameters" JSONB NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "classId" TEXT NOT NULL,

    CONSTRAINT "uml_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uml_relations" (
    "id" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "multiplicity" TEXT,
    "name" TEXT,
    "sourceClassId" TEXT NOT NULL,
    "targetClassId" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,

    CONSTRAINT "uml_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagram_activities" (
    "id" TEXT NOT NULL,
    "action" "ActivityType" NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "diagramId" TEXT NOT NULL,

    CONSTRAINT "diagram_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_codes" (
    "id" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL DEFAULT 'SPRING_BOOT',
    "zipPath" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diagramId" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,

    CONSTRAINT "generated_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_collaborators_userId_workspaceId_key" ON "workspace_collaborators"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_collaborators" ADD CONSTRAINT "workspace_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_collaborators" ADD CONSTRAINT "workspace_collaborators_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagrams" ADD CONSTRAINT "diagrams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uml_classes" ADD CONSTRAINT "uml_classes_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "diagrams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uml_attributes" ADD CONSTRAINT "uml_attributes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "uml_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uml_methods" ADD CONSTRAINT "uml_methods_classId_fkey" FOREIGN KEY ("classId") REFERENCES "uml_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uml_relations" ADD CONSTRAINT "uml_relations_sourceClassId_fkey" FOREIGN KEY ("sourceClassId") REFERENCES "uml_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uml_relations" ADD CONSTRAINT "uml_relations_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "uml_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uml_relations" ADD CONSTRAINT "uml_relations_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "diagrams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagram_activities" ADD CONSTRAINT "diagram_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagram_activities" ADD CONSTRAINT "diagram_activities_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "diagrams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_codes" ADD CONSTRAINT "generated_codes_diagramId_fkey" FOREIGN KEY ("diagramId") REFERENCES "diagrams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_codes" ADD CONSTRAINT "generated_codes_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
