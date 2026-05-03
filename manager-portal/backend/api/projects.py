from __future__ import annotations

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from backend.database import get_db
from backend.models.projects import Project, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = "active"
    owner_id: Optional[int] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None


class ProjectUpdateBody(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    owner_id: Optional[int] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[str] = None


class ProjectUpdateCreate(BaseModel):
    content: str
    author_id: Optional[int] = None
    source: Optional[str] = None
    transcript_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_projects(status: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """List all active projects; optionally filter by status."""
    q = db.query(Project).filter(Project.deleted_at == None)  # noqa: E711
    if status:
        q = q.filter(Project.status == status)
    projects = q.all()
    return [p.to_dict() for p in projects]


@router.post("", status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(**body.model_dump(exclude_none=True))
    db.add(project)
    db.flush()
    db.refresh(project)
    return project.to_dict()


@router.get("/{id}")
def get_project(id: int, db: Session = Depends(get_db)):
    """Get a project including its updates."""
    project = db.query(Project).filter(
        Project.id == id, Project.deleted_at == None  # noqa: E711
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    data = project.to_dict()
    updates = db.query(ProjectUpdate).filter(
        ProjectUpdate.project_id == id
    ).order_by(ProjectUpdate.created_at.desc()).all()
    data["updates"] = [u.to_dict() for u in updates]
    return data


@router.put("/{id}")
def update_project(id: int, body: ProjectUpdateBody, db: Session = Depends(get_db)):
    project = db.query(Project).filter(
        Project.id == id, Project.deleted_at == None  # noqa: E711
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    db.flush()
    db.refresh(project)
    return project.to_dict()


@router.delete("/{id}", status_code=204)
def delete_project(id: int, db: Session = Depends(get_db)):
    project = db.query(Project).filter(
        Project.id == id, Project.deleted_at == None  # noqa: E711
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.deleted_at = datetime.utcnow()
    db.flush()


@router.post("/{id}/updates", status_code=201)
def add_project_update(id: int, body: ProjectUpdateCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(
        Project.id == id, Project.deleted_at == None  # noqa: E711
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    update = ProjectUpdate(project_id=id, **body.model_dump(exclude_none=True))
    db.add(update)
    db.flush()
    db.refresh(update)
    return update.to_dict()
