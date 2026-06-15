# backend/tests/test_rnaseq_pathway_pipeline.py
"""Tests for the clusterProfiler pathway analysis pipeline stage."""

import json

import pytest

from pipelines.rnaseq_pathway import ORGANISM_MAP, RnaseqPathwayStage, _filter_de_results


@pytest.fixture
def stage():
    return RnaseqPathwayStage()


def _make_valid_params() -> dict:
    return {
        "experiment_id": 1,
        "project_id": 1,
        "de_job_id": 10,
        "reference_genome": "mm10",
        "gene_list_source": "both",
        "fdr_threshold": 0.05,
        "enable_gsea": False,
        "de_results_path": "projects/1/1/jobs/10/results/de_results.tsv",
    }


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


def test_validate_valid_params(stage):
    errors = stage.validate(_make_valid_params())
    assert errors == []


def test_validate_missing_experiment_id(stage):
    params = _make_valid_params()
    del params["experiment_id"]
    errors = stage.validate(params)
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_project_id(stage):
    params = _make_valid_params()
    del params["project_id"]
    errors = stage.validate(params)
    assert any("project_id" in e for e in errors)


def test_validate_missing_de_job_id(stage):
    params = _make_valid_params()
    del params["de_job_id"]
    errors = stage.validate(params)
    assert any("de_job_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    params = _make_valid_params()
    del params["reference_genome"]
    errors = stage.validate(params)
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome_dm6(stage):
    params = _make_valid_params()
    params["reference_genome"] = "dm6"
    errors = stage.validate(params)
    assert any("Unsupported" in e for e in errors)


def test_validate_unsupported_genome_sacCer3(stage):
    params = _make_valid_params()
    params["reference_genome"] = "sacCer3"
    errors = stage.validate(params)
    assert any("Unsupported" in e for e in errors)


def test_validate_hg38_supported(stage):
    params = _make_valid_params()
    params["reference_genome"] = "hg38"
    errors = stage.validate(params)
    assert errors == []


def test_validate_invalid_gene_list_source(stage):
    params = _make_valid_params()
    params["gene_list_source"] = "invalid"
    errors = stage.validate(params)
    assert any("gene_list_source" in e for e in errors)


def test_validate_fdr_too_high(stage):
    params = _make_valid_params()
    params["fdr_threshold"] = 1.5
    errors = stage.validate(params)
    assert any("fdr_threshold" in e for e in errors)


def test_validate_fdr_negative(stage):
    params = _make_valid_params()
    params["fdr_threshold"] = -0.1
    errors = stage.validate(params)
    assert any("fdr_threshold" in e for e in errors)


def test_validate_missing_de_results_path(stage):
    params = _make_valid_params()
    del params["de_results_path"]
    errors = stage.validate(params)
    assert any("de_results_path" in e for e in errors)


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_creates_outputs(stage, tmp_path):
    params = _make_valid_params()
    job_dir = tmp_path / "job_dir"
    job_dir.mkdir()

    result = stage.mock_run(1, params, tmp_path, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) > 0

    categories = {o["file_category"] for o in result["outputs"]}
    assert "go_results" in categories
    assert "kegg_results" in categories
    assert "pathway_summary" in categories
    assert "go_bp_plot" in categories
    assert "kegg_plot" in categories
    assert "gene_list" in categories
    assert "master_log" in categories


def test_mock_run_go_csv_correct_columns(stage, tmp_path):
    params = _make_valid_params()
    job_dir = tmp_path / "job_dir"
    job_dir.mkdir()

    stage.mock_run(1, params, tmp_path, job_dir)

    go_csv = job_dir / "results" / "go_results.csv"
    assert go_csv.exists()
    header = go_csv.read_text().splitlines()[0]
    assert "ID" in header
    assert "Description" in header
    assert "ontology" in header


def test_mock_run_kegg_csv_correct_columns(stage, tmp_path):
    params = _make_valid_params()
    job_dir = tmp_path / "job_dir"
    job_dir.mkdir()

    stage.mock_run(1, params, tmp_path, job_dir)

    kegg_csv = job_dir / "results" / "kegg_results.csv"
    assert kegg_csv.exists()
    header = kegg_csv.read_text().splitlines()[0]
    assert "ID" in header
    assert "Description" in header


def test_mock_run_summary_json_structure(stage, tmp_path):
    params = _make_valid_params()
    job_dir = tmp_path / "job_dir"
    job_dir.mkdir()

    stage.mock_run(1, params, tmp_path, job_dir)

    summary_json = job_dir / "results" / "pathway_summary.json"
    assert summary_json.exists()
    summary = json.loads(summary_json.read_text())
    assert "total_input_genes" in summary
    assert "mapped_entrez_genes" in summary
    assert "unmapped_genes" in summary
    assert "go_bp_terms" in summary
    assert "go_mf_terms" in summary
    assert "go_cc_terms" in summary
    assert "kegg_pathways" in summary
    assert "gsea_enabled" in summary


def test_mock_run_gene_list_created(stage, tmp_path):
    params = _make_valid_params()
    job_dir = tmp_path / "job_dir"
    job_dir.mkdir()

    stage.mock_run(1, params, tmp_path, job_dir)

    gene_list = job_dir / "gene_list.tsv"
    assert gene_list.exists()
    lines = gene_list.read_text().strip().splitlines()
    assert len(lines) > 1
    assert "gene_id" in lines[0]


def test_mock_run_gsea_enabled(stage, tmp_path):
    params = _make_valid_params()
    params["enable_gsea"] = True
    job_dir = tmp_path / "job_dir"
    job_dir.mkdir()

    result = stage.mock_run(1, params, tmp_path, job_dir)
    categories = {o["file_category"] for o in result["outputs"]}
    assert "gsea_plot" in categories

    summary = json.loads((job_dir / "results" / "pathway_summary.json").read_text())
    assert summary["gsea_enabled"] is True
    assert summary["gsea_terms"] > 0


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_mentions_clusterprofiler(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert "clusterProfiler" in text
    assert "GO" in text or "gene ontology" in text.lower()
    assert "KEGG" in text


def test_methods_text_includes_genome(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert "Mouse" in text or "mm10" in text


def test_methods_text_upregulated_direction(stage):
    params = _make_valid_params()
    params["gene_list_source"] = "upregulated"
    text = stage.generate_methods_text(params)
    assert "upregulated" in text


# ---------------------------------------------------------------------------
# Gene filter helper test
# ---------------------------------------------------------------------------


def test_filter_de_results(tmp_path):
    tsv = tmp_path / "de_results.tsv"
    tsv.write_text(
        "gene_name\tgene_id\tbaseMean\tlog2FoldChange\tlfcSE\tstat\tpvalue\tpadj\n"
        "Myc\tENSMUSG00000022346\t312.7\t2.45\t0.31\t7.9\t2.8e-15\t1.4e-12\n"
        "Trp53\tENSMUSG00000059552\t678.4\t-1.87\t0.28\t-6.68\t2.4e-11\t6.0e-9\n"
        "Gapdh\tENSMUSG00000057666\t5432.1\t-0.12\t0.08\t-1.5\t0.134\t0.892\n"
    )

    # Both direction
    both = _filter_de_results(tsv, 0.05, "both")
    assert len(both) == 2

    # Upregulated only
    up = _filter_de_results(tsv, 0.05, "upregulated")
    assert len(up) == 1
    assert up[0]["gene_name"] == "Myc"

    # Downregulated only
    down = _filter_de_results(tsv, 0.05, "downregulated")
    assert len(down) == 1
    assert down[0]["gene_name"] == "Trp53"


def test_organism_map_entries():
    assert "mm10" in ORGANISM_MAP
    assert "hg38" in ORGANISM_MAP
    assert ORGANISM_MAP["mm10"]["code"] == "mmu"
    assert ORGANISM_MAP["hg38"]["code"] == "hsa"
    assert ORGANISM_MAP["mm10"]["org_db"] == "org.Mm.eg.db"
