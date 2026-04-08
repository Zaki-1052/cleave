# backend/tests/test_reactions.py
import io

from httpx import AsyncClient


async def _register_and_get_headers(client: AsyncClient, email: str) -> dict:
    """Register a user and return auth headers."""
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 201
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> int:
    """Create a project and return its ID."""
    resp = await client.post(
        "/api/v1/projects",
        json={"name": name},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_experiment(
    client: AsyncClient, headers: dict, project_id: int, name: str = "H3K4me3"
) -> int:
    """Create an experiment and return its ID."""
    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": name, "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _reaction_body(
    prefix: str = "230301_IgG_trimmed_L001",
    short_name: str = "IgG",
    organism: str = "Mouse",
    **overrides,
) -> dict:
    """Build a camelCase reaction JSON body."""
    body = {
        "fastqPrefix": prefix,
        "shortName": short_name,
        "organism": organism,
        "assayType": "CUT&RUN",
    }
    body.update(overrides)
    return body


async def _create_rnaseq_experiment(
    client: AsyncClient, headers: dict, project_id: int, name: str = "Bulk RNA-seq"
) -> int:
    """Create an RNA-seq experiment and return its ID."""
    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": name, "assayType": "RNA-seq"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _rnaseq_reaction_body(
    prefix: str = "rnaseq_sample1_L001",
    short_name: str = "ctrl-rep1",
    organism: str = "Human",
    **overrides,
) -> dict:
    """Build a camelCase RNA-seq reaction JSON body."""
    body = {
        "fastqPrefix": prefix,
        "shortName": short_name,
        "organism": organism,
        "assayType": "RNA-seq",
        "treatment": "DMSO",
        "timepoint": "24h",
        "genotype": "WT",
        "replicateNumber": 1,
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# CRUD tests
# ---------------------------------------------------------------------------


async def test_create_reaction_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(ecoliSpikeIn=True),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["fastqPrefix"] == "230301_IgG_trimmed_L001"
    assert data["shortName"] == "IgG"
    assert data["organism"] == "Mouse"
    assert data["assayType"] == "CUT&RUN"
    assert data["ecoliSpikeIn"] is True
    assert data["cutanaSpikeIn"] == "None"
    assert data["experimentId"] == exp_id
    assert "id" in data


async def test_create_reaction_invalid_organism(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(organism="Cat"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_invalid_assay_type(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(assayType="ATAC-seq"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_missing_required_field(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json={"fastqPrefix": "test_L001", "organism": "Mouse", "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_duplicate_short_name(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp1 = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers,
    )
    assert resp1.status_code == 201

    # Same organism + short_name → 409
    resp2 = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(prefix="different_prefix_L001"),
        headers=headers,
    )
    assert resp2.status_code == 409


async def test_create_reaction_nonmember(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_other = await _register_and_get_headers(client, "other@example.com")
    project_id = await _create_project(client, headers_owner)
    exp_id = await _create_experiment(client, headers_owner, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers_other,
    )
    assert resp.status_code == 403


async def test_create_reaction_viewer_forbidden(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_viewer = await _register_and_get_headers(client, "viewer@example.com")
    project_id = await _create_project(client, headers_owner)
    exp_id = await _create_experiment(client, headers_owner, project_id)

    # Add viewer
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=headers_owner,
    )

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers_viewer,
    )
    assert resp.status_code == 403


async def test_list_reactions_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create 3 reactions
    for name in ["IgG", "K4me3_ctrl1", "K4me3_mut1"]:
        await client.post(
            f"/api/v1/experiments/{exp_id}/reactions",
            json=_reaction_body(short_name=name, shortName=name),
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/reactions",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    names = {item["shortName"] for item in data["items"]}
    assert names == {"IgG", "K4me3_ctrl1", "K4me3_mut1"}


async def test_list_reactions_pagination(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    for name in ["IgG", "K4me3_ctrl1", "K4me3_mut1"]:
        await client.post(
            f"/api/v1/experiments/{exp_id}/reactions",
            json=_reaction_body(shortName=name),
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/reactions",
        params={"perPage": 2},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["perPage"] == 2


async def test_update_reaction_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers,
    )
    reaction_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/experiments/{exp_id}/reactions/{reaction_id}",
        json={"shortName": "IgG_updated"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["shortName"] == "IgG_updated"


async def test_update_reaction_partial(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(ecoliSpikeIn=True),
        headers=headers,
    )
    reaction_id = create_resp.json()["id"]

    # Only update cellType, verify other fields unchanged
    resp = await client.patch(
        f"/api/v1/experiments/{exp_id}/reactions/{reaction_id}",
        json={"cellType": "K562"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["cellType"] == "K562"
    assert data["shortName"] == "IgG"
    assert data["ecoliSpikeIn"] is True


async def test_update_reaction_unique_violation(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create two reactions
    await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(shortName="IgG"),
        headers=headers,
    )
    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(shortName="K4me3"),
        headers=headers,
    )
    reaction_id = create_resp.json()["id"]

    # Try to rename K4me3 to IgG → conflict
    resp = await client.patch(
        f"/api/v1/experiments/{exp_id}/reactions/{reaction_id}",
        json={"shortName": "IgG"},
        headers=headers,
    )
    assert resp.status_code == 409


async def test_delete_reaction_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers,
    )
    reaction_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/experiments/{exp_id}/reactions/{reaction_id}",
        headers=headers,
    )
    assert resp.status_code == 204

    # Verify gone from list
    list_resp = await client.get(
        f"/api/v1/experiments/{exp_id}/reactions",
        headers=headers,
    )
    assert list_resp.json()["total"] == 0


async def test_delete_reaction_viewer_forbidden(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_viewer = await _register_and_get_headers(client, "viewer@example.com")
    project_id = await _create_project(client, headers_owner)
    exp_id = await _create_experiment(client, headers_owner, project_id)

    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=headers_owner,
    )

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers_owner,
    )
    reaction_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/experiments/{exp_id}/reactions/{reaction_id}",
        headers=headers_viewer,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Bulk create tests
# ---------------------------------------------------------------------------


async def test_bulk_create_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/bulk",
        json={
            "reactions": [
                _reaction_body(shortName="IgG"),
                _reaction_body(shortName="K4me3_ctrl1"),
                _reaction_body(shortName="K4me3_mut1"),
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 3
    assert len(data["reactions"]) == 3


async def test_bulk_create_duplicate_within_batch(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/bulk",
        json={
            "reactions": [
                _reaction_body(shortName="IgG"),
                _reaction_body(shortName="IgG"),
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# CSV import tests
# ---------------------------------------------------------------------------


async def test_import_csv_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    csv_content = (
        "FASTQ_Prefix,Short_Name,Organism,Assay_Type,E.coli_Spike_in\n"
        "230301_IgG_L001,IgG,Mouse,CUT&RUN,Yes\n"
        "230301_ctrl1_L001,K4me3_ctrl1,Mouse,CUT&RUN,No\n"
    )
    files = {"file": ("reactions.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/import-csv",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 2
    assert len(data["reactions"]) == 2

    # Verify boolean conversion
    igc = next(r for r in data["reactions"] if r["shortName"] == "IgG")
    ctrl = next(r for r in data["reactions"] if r["shortName"] == "K4me3_ctrl1")
    assert igc["ecoliSpikeIn"] is True
    assert ctrl["ecoliSpikeIn"] is False


async def test_import_csv_boolean_conversion(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    csv_content = (
        "FASTQ_Prefix,Short_Name,Organism,Assay_Type,E.coli_Spike_in\n"
        "prefix_a_L001,sample_a,Mouse,CUT&RUN,yes\n"
        "prefix_b_L001,sample_b,Mouse,CUT&RUN,no\n"
        "prefix_c_L001,sample_c,Mouse,CUT&RUN,TRUE\n"
        "prefix_d_L001,sample_d,Mouse,CUT&RUN,\n"
    )
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/import-csv",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    reactions = {r["shortName"]: r for r in data["reactions"]}
    assert reactions["sample_a"]["ecoliSpikeIn"] is True
    assert reactions["sample_b"]["ecoliSpikeIn"] is False
    assert reactions["sample_c"]["ecoliSpikeIn"] is True
    assert reactions["sample_d"]["ecoliSpikeIn"] is False


async def test_import_csv_ignored_columns(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    csv_content = (
        "FASTQ_Prefix,Short_Name,Organism,Assay_Type,Reference_Genome\n"
        "prefix_a_L001,IgG,Mouse,CUT&RUN,Mouse mm10\n"
    )
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/import-csv",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 1
    assert any("ignored" in w.lower() for w in data["warnings"])


async def test_import_csv_missing_required_column(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Missing Short_Name column
    csv_content = "FASTQ_Prefix,Organism,Assay_Type\nprefix_a_L001,Mouse,CUT&RUN\n"
    files = {"file": ("test.csv", io.BytesIO(csv_content.encode()), "text/csv")}

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/import-csv",
        files=files,
        headers=headers,
    )
    assert resp.status_code == 422
    assert "short_name" in resp.json()["detail"].lower()


async def test_download_template(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/reactions/template",
        headers=headers,
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "attachment" in resp.headers["content-disposition"]

    content = resp.text
    assert "FASTQ_Prefix" in content
    assert "Short_Name" in content
    assert "Organism" in content
    assert "E.coli_Spike_in" in content


# ---------------------------------------------------------------------------
# Prefix detection tests
# ---------------------------------------------------------------------------


async def test_list_prefixes_with_uploads(client: AsyncClient, tmp_path):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create minimal FASTQ files to upload
    r1_path = tmp_path / "sample1_R1_001.fastq.gz"
    r2_path = tmp_path / "sample1_R2_001.fastq.gz"
    r1_path.write_bytes(b"\x1f\x8b" + b"\x00" * 20)
    r2_path.write_bytes(b"\x1f\x8b" + b"\x00" * 20)

    # Upload R1 and R2
    with open(r1_path, "rb") as f1, open(r2_path, "rb") as f2:
        await client.post(
            f"/api/v1/experiments/{exp_id}/fastqs/upload",
            files=[
                ("files", ("sample1_R1_001.fastq.gz", f1, "application/gzip")),
                ("files", ("sample1_R2_001.fastq.gz", f2, "application/gzip")),
            ],
            headers=headers,
        )

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/reactions/prefixes",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["prefix"] == "sample1"
    assert data[0]["hasR1"] is True
    assert data[0]["hasR2"] is True


async def test_list_prefixes_empty(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/reactions/prefixes",
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Security: short_name and fastq_prefix path traversal prevention
# ---------------------------------------------------------------------------


async def test_create_reaction_rejects_path_traversal(client: AsyncClient):
    """short_name with ../ must be rejected to prevent path traversal."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(short_name="../../../tmp/evil"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_rejects_slash(client: AsyncClient):
    """short_name with forward slash must be rejected."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(short_name="foo/bar"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_rejects_backslash(client: AsyncClient):
    """short_name with backslash must be rejected."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(short_name="foo\\bar"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_rejects_null_byte(client: AsyncClient):
    """short_name with null byte must be rejected."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(short_name="foo\x00bar"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_rejects_space_in_short_name(client: AsyncClient):
    """short_name with spaces must be rejected (unsafe in filenames)."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(short_name="foo bar"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_create_reaction_valid_complex_short_name(client: AsyncClient):
    """short_name with allowed special chars (underscore, hyphen, dot) succeeds."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(short_name="K4me3_ctrl-1.rep2"),
        headers=headers,
    )
    assert resp.status_code == 201
    assert resp.json()["shortName"] == "K4me3_ctrl-1.rep2"


async def test_create_reaction_rejects_prefix_path_traversal(client: AsyncClient):
    """fastq_prefix with ../ must be rejected."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(prefix="../../etc/passwd"),
        headers=headers,
    )
    assert resp.status_code == 422


async def test_csv_import_rejects_path_traversal_short_name(client: AsyncClient):
    """CSV import with traversal short_name must be rejected."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    csv_content = "FASTQ Prefix,Short Name,Organism\nsample1,../../../evil,Mouse\n"
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/import-csv",
        files={"file": ("reactions.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# RNA-seq reaction tests
# ---------------------------------------------------------------------------


async def test_create_rnaseq_reaction_with_fields(client: AsyncClient):
    """Create an RNA-seq reaction with treatment/timepoint/genotype/replicateNumber."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_rnaseq_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_rnaseq_reaction_body(),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["assayType"] == "RNA-seq"
    assert data["treatment"] == "DMSO"
    assert data["timepoint"] == "24h"
    assert data["genotype"] == "WT"
    assert data["replicateNumber"] == 1


async def test_update_rnaseq_reaction_fields(client: AsyncClient):
    """Partial update of RNA-seq fields preserves unchanged fields."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_rnaseq_experiment(client, headers, project_id)

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_rnaseq_reaction_body(),
        headers=headers,
    )
    reaction_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/experiments/{exp_id}/reactions/{reaction_id}",
        json={"treatment": "Dexamethasone", "replicateNumber": 2},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["treatment"] == "Dexamethasone"
    assert data["replicateNumber"] == 2
    assert data["timepoint"] == "24h"
    assert data["genotype"] == "WT"


async def test_import_csv_rnaseq_fields(client: AsyncClient):
    """CSV import parses RNA-seq fields including integer replicate_number."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_rnaseq_experiment(client, headers, project_id)

    csv_content = (
        "FASTQ_Prefix,Short_Name,Organism,Assay_Type,Treatment,Timepoint,Genotype,Replicate_Number\n"
        "sample1_L001,ctrl-rep1,Human,RNA-seq,DMSO,24h,WT,1\n"
        "sample2_L001,treat-rep1,Human,RNA-seq,Drug,24h,KO,2\n"
    )
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/import-csv",
        files={"file": ("reactions.csv", io.BytesIO(csv_content.encode()), "text/csv")},
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 2

    ctrl = next(r for r in data["reactions"] if r["shortName"] == "ctrl-rep1")
    treat = next(r for r in data["reactions"] if r["shortName"] == "treat-rep1")
    assert ctrl["treatment"] == "DMSO"
    assert ctrl["replicateNumber"] == 1
    assert treat["treatment"] == "Drug"
    assert treat["genotype"] == "KO"
    assert treat["replicateNumber"] == 2


async def test_bulk_create_rnaseq_reactions(client: AsyncClient):
    """Bulk create RNA-seq reactions with RNA-seq-specific fields."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_rnaseq_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions/bulk",
        json={
            "reactions": [
                _rnaseq_reaction_body(short_name="ctrl-rep1", replicateNumber=1),
                _rnaseq_reaction_body(
                    prefix="rnaseq_sample2_L001",
                    short_name="ctrl-rep2",
                    replicateNumber=2,
                ),
            ]
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["created"] == 2
    assert all(r["assayType"] == "RNA-seq" for r in data["reactions"])


async def test_cutandrun_reactions_null_rnaseq_fields(client: AsyncClient):
    """CUT&RUN reactions have null RNA-seq fields by default."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json=_reaction_body(),
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["treatment"] is None
    assert data["timepoint"] is None
    assert data["genotype"] is None
    assert data["replicateNumber"] is None
