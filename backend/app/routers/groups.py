import uuid

from fastapi import APIRouter, HTTPException

from app.database import get_client, get_namespace
from app.schemas import GroupCreate, GroupUpdate, GroupOut

router = APIRouter(tags=["groups"])

SET_NAME = "groups"


@router.get("/groups", response_model=list[GroupOut])
async def list_groups():
    client = get_client()
    query = client.query(get_namespace(), SET_NAME)
    results = []

    def callback(record):
        _, _, bins = record
        results.append(GroupOut(
            id=bins.get("id", ""),
            name=bins.get("name", ""),
            description=bins.get("description", ""),
        ))

    query.foreach(callback)
    results.sort(key=lambda g: g.name)
    return results


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(group: GroupCreate):
    client = get_client()
    group_id = str(uuid.uuid4())
    key = (get_namespace(), SET_NAME, group_id)
    bins = {
        "id": group_id,
        "name": group.name,
        "description": group.description or "",
    }
    client.put(key, bins)
    return GroupOut(**bins)


@router.put("/groups/{group_id}", response_model=GroupOut)
async def update_group(group_id: str, group: GroupUpdate):
    client = get_client()
    key = (get_namespace(), SET_NAME, group_id)
    try:
        _, _, existing = client.get(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")

    update_data = group.model_dump(exclude_none=True)
    if update_data:
        existing.update(update_data)
        client.put(key, existing)

    return GroupOut(
        id=existing.get("id", group_id),
        name=existing.get("name", ""),
        description=existing.get("description", ""),
    )


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(group_id: str):
    client = get_client()
    key = (get_namespace(), SET_NAME, group_id)
    try:
        client.remove(key)
    except Exception:
        raise HTTPException(status_code=404, detail="Group not found")
