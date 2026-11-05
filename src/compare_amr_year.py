"""Compare the saved AMR feature set with and without case year."""
from pathlib import Path

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, balanced_accuracy_score, brier_score_loss,
    f1_score, roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


DATA_PATH = Path(r"C:\Users\monst\AppData\Local\Packages\5319275A.WhatsAppDesktop_cv1g1gvanyjgm\LocalState\sessions\1CACF220731FB180EA40AEA0C79BFF7FC7C450E5\transfers\2026-44\SSTI_Dataset-JRRH.xlsx")


def make_model(features: list[str]) -> Pipeline:
    numeric = [name for name in ["Year Case"] if name in features]
    categorical = [name for name in features if name not in numeric]
    transformers = []
    if numeric:
        transformers.append(("numeric", Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]), numeric))
    if categorical:
        transformers.append(("categorical", Pipeline([
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]), categorical))
    return Pipeline([
        ("preprocessor", ColumnTransformer(transformers)),
        ("classifier", LogisticRegression(max_iter=2000, random_state=42)),
    ])


def main() -> None:
    df = pd.read_excel(DATA_PATH)
    for column in df.select_dtypes(include=["object", "string"]).columns:
        df[column] = df[column].apply(lambda value: value.strip() if isinstance(value, str) else value)
    df["MDR Pathogen"] = df["MDR Pathogen"].astype("string").str.strip().str.lower().map({"yes": "Yes", "no": "No"})
    df["Infection"] = df["Infection"].astype("string").str.strip().str.lower().map({"yes": "Yes", "no": "No"})
    df = df[df["MDR Pathogen"].notna() & (df["Infection"] == "Yes")].copy()
    y = df["MDR Pathogen"].map({"No": 0, "Yes": 1})
    feature_sets = {
        "with_year": ["Year Case", "Sex", "Age Group", "On Abx"],
        "without_year": ["Sex", "Age Group", "On Abx"],
    }
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    print(f"Records: {len(df)}; class counts: {y.value_counts().sort_index().to_dict()}")
    for label, features in feature_sets.items():
        probabilities = cross_val_predict(make_model(features), df[features], y, cv=cv, method="predict_proba")[:, 1]
        predictions = (probabilities >= 0.5).astype(int)
        print(label, {
            "accuracy": round(accuracy_score(y, predictions), 4),
            "balanced_accuracy": round(balanced_accuracy_score(y, predictions), 4),
            "macro_f1": round(f1_score(y, predictions, average="macro"), 4),
            "roc_auc": round(roc_auc_score(y, probabilities), 4),
            "brier": round(brier_score_loss(y, probabilities), 4),
        })


if __name__ == "__main__":
    main()
